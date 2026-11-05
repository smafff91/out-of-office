<script lang="ts">
	// City map and list (LatteHome, LatteList, LatteNoResults, LatteDesktop), shared by the
	// city page and its place pages: going back from a place finds the list as it was.
	// - Phones: a tap on a pin or a row opens the preview over the map (LattePreview), kept in
	//   the history state so Back closes it; the place page covers the screen.
	// - Desktop: a click opens the place page in the left panel, the map centers on the place.
	// - Ordering, the Certified filter and search run in the browser on the map pins: the user's
	//   position never leaves the device. Only the rows on screen are fetched (20 at a time).
	// - Location is never requested automatically here: the user's dot appears only if the
	//   browser reports the permission as granted, or after "Show my location".
	// - Nearest starts from the user, else the picked area, else the city center; distances are
	//   shown only for the user's real position.
	// - A language change reloads the page: the screen is saved just before (map area, panel,
	//   order, filter, preview, scroll; view-state.ts) and put back as it was after the reload.
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BottomSheet from '#lib/components/home/BottomSheet.svelte';
	import DesktopBar from '#lib/components/home/DesktopBar.svelte';
	import DraggableSheet, { type Snap } from '#lib/components/home/DraggableSheet.svelte';
	import LaunchMessage from '#lib/components/home/LaunchMessage.svelte';
	import LocationButton from '#lib/components/home/LocationButton.svelte';
	import NoCertified from '#lib/components/home/NoCertified.svelte';
	import PlaceList from '#lib/components/home/PlaceList.svelte';
	import SearchBox from '#lib/components/home/SearchBox.svelte';
	import SortControl from '#lib/components/home/SortControl.svelte';
	import TopBar from '#lib/components/home/TopBar.svelte';
	import { onBeforeLeave, stash, takeStash } from '#lib/auth/handoff.ts';
	import { onPlaceUpdated } from '#lib/contribute/updates.ts';
	import PlacePreview from '#lib/components/place/PlacePreview.svelte';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import {
		CityMap,
		isInside,
		type Bounds,
		type Insets,
		type LngLat,
		type MapView,
		type PlaceCollection,
		type PlaceFeature
	} from '#lib/map/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { distanceMeters } from '#lib/places/distance.ts';
	import {
		buildSections,
		firstEntries,
		totalEntries,
		type Origin,
		type Section,
		type Sort
	} from '#lib/places/list.ts';
	import {
		CITY_VIEW_KEY,
		parseCityView,
		serializeCityView,
		type CityViewState
	} from '#lib/places/view-state.ts';
	import { getPositionIfGranted, requestPosition } from '#lib/platform/geolocation.ts';
	import { fetchAreas, fetchCityPlaces, type AreaSummary } from '#lib/supabase/cities.ts';
	import { createSupabaseClient } from '#lib/supabase/client.ts';
	import { fetchPlaceDetail, toFeature, type PlaceDetail } from '#lib/supabase/place-details.ts';
	import {
		fetchListItems,
		fetchRanking,
		PAGE_SIZE,
		type ListItem,
		type RankedPlace
	} from '#lib/supabase/places.ts';
	import type { LayoutProps } from './$types';

	const NOTICE_MS = 5000;
	/** "Search this area" appears once the map center is this far from where the list starts. */
	const SEARCH_AREA_MIN_METERS = 300;
	const DESKTOP_QUERY = '(min-width: 1024px)';

	let { data, children }: LayoutProps = $props();
	const city = $derived(data.city);
	/** The place page on screen, if any (/{city}/{place}). */
	const placeSlug = $derived(page.params.place);
	const openPlace = $derived(page.data.place as PlaceDetail | undefined);

	const boundsCenter = ([w, s, e, n]: Bounds): LngLat => [(w + e) / 2, (s + n) / 2];

	let map = $state<ReturnType<typeof CityMap>>();
	let places = $state<PlaceCollection>();
	let areas = $state<AreaSummary[]>([]);
	let ranking = $state<RankedPlace[]>();
	let user = $state<LngLat>();
	let origin = $state<Origin>(
		untrack(() =>
			page.state.area
				? { point: boundsCenter(page.state.area), kind: 'area' }
				: { point: data.city.center, kind: 'center' }
		)
	);
	let sort = $state<Sort>('nearest');
	// On by default where the city says so; the user's choice lasts while they stay on the page.
	let certifiedOnly = $state(untrack(() => data.city.certifiedFilterDefault));
	let pages = $state(1);
	let view = $state<MapView>();
	let movedByUser = $state(false);
	let searchOpen = $state(false);
	let snap = $state<Snap>('half');
	let sheetHeight = $state(0);
	let topBarHeight = $state(128);
	let desktop = $state(false);
	let previewHeight = $state(0);
	/** MapLibre loads only once the map is on screen (not under a place page on phones). */
	let mapWanted = $state(untrack(() => !page.params.place));
	let panel = $state<HTMLElement>();
	let listScroller = $state<HTMLElement>();
	/** Map center and zoom saved before a language reload: the map opens on them. */
	let restoredCamera = $state<{ center: LngLat; zoom: number }>();
	/** List scroll to put back once the rows are on screen again. */
	let pendingListScroll: number | undefined;
	let locating = $state(false);
	let notice = $state<string>();
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	// Row details already fetched (first page from the server), and those on their way.
	const items = new SvelteMap<string, ListItem>(
		untrack(() => data.centerItems.map((item) => [item.slug, item]))
	);
	const loading = new SvelteSet<string>();
	/** Places opened in the preview (also cached for a minute in place-details.ts). */
	const previews = new SvelteMap<string, PlaceDetail>();
	/** Rows whose request failed: not retried until the list changes (no request loops). */
	const failed = new SvelteSet<string>();

	const sections = $derived.by((): Section[] | undefined => {
		if (places) return buildSections(places, { origin, sort, certifiedOnly, ranking });
		// Before the pins arrive (and on the server): the rows nearest to the city center, fetched
		// with the city's default filter.
		if (sort !== 'nearest' || certifiedOnly !== data.city.certifiedFilterDefault) return undefined;
		return [
			{
				id: 'all',
				entries: data.centerItems.map((item) => ({
					slug: item.slug,
					name: item.name,
					level: item.level,
					point: item.point,
					distance: distanceMeters(origin.point, item.point)
				}))
			}
		];
	});
	const visible = $derived(sections ? firstEntries(sections, pages * PAGE_SIZE) : []);
	const hasMore = $derived(!!places && !!sections && totalEntries(sections) > pages * PAGE_SIZE);
	const visibleSlugs = $derived(visible.flatMap((section) => section.entries.map((e) => e.slug)));

	const previewSlug = $derived(desktop || placeSlug ? undefined : page.state.preview);
	const selectedSlug = $derived(placeSlug ?? previewSlug);

	const selected = $derived.by((): PlaceFeature | undefined => {
		if (!selectedSlug) return undefined;
		const feature = places?.features.find((f) => f.properties.slug === selectedSlug);
		if (feature) return feature;
		if (openPlace?.slug === selectedSlug) return toFeature(openPlace);
		const item = items.get(selectedSlug) ?? previews.get(selectedSlug);
		return item
			? {
					type: 'Feature',
					geometry: { type: 'Point', coordinates: item.point },
					properties: { slug: item.slug, name: item.name, level: item.level }
				}
			: undefined;
	});

	// Certified filter with no certified place in view: LatteNoResults.
	const inView = $derived(
		places && view
			? places.features.filter((f) => isInside(f.geometry.coordinates, view!.bounds))
			: []
	);
	const noCertifiedInView = $derived(
		certifiedOnly && !!places && !!view && !inView.some((f) => f.properties.level === 'certified')
	);
	const uncheckedInView = $derived(inView.filter((f) => f.properties.level === 'osm_only').length);
	const hasCertified = $derived(!!places?.features.some((f) => f.properties.level === 'certified'));

	const showSearchArea = $derived(
		movedByUser && !!view && distanceMeters(view.center, origin.point) > SEARCH_AREA_MIN_METERS
	);

	/** Height of the panel over the bottom of the map on phones: the list or the preview. */
	const bottomPanel = $derived(previewSlug ? previewHeight : sheetHeight);

	const insets = $derived<Insets>(
		desktop
			? { top: 32, bottom: 32, left: 32, right: 32 }
			: { top: topBarHeight + 16, bottom: bottomPanel + 16, left: 24, right: 24 }
	);

	// The map loads as soon as it is visible: always on desktop, on phones away from a place page.
	$effect(() => {
		if (desktop || !placeSlug) mapWanted = true;
	});

	// Center the map on the selected place.
	// - Desktop: on each arrival on a place page or form (from the list, a link or the address
	//   bar), in the map beside the panel. After a tap on its pin, from the page to the form of the
	//   same place, or back from a language reload, it moves only if the pin is hidden or at an edge.
	// - Phones: once per place. The preview first gets its final height (details loaded), so the
	//   pin lands above it, not under it.
	let centeredOn: string | undefined;
	let centeredPath: string | undefined;
	/** The place whose pin was just tapped on the map (desktop). */
	let tappedPin: string | undefined;
	/** The camera was restored after a language reload: keep it if the place is in view. */
	let keepCamera = false;
	$effect(() => {
		const point = selected?.geometry.coordinates;
		if (!selectedSlug) centeredOn = centeredPath = undefined;
		if (!selectedSlug || !point) return;
		if (desktop) {
			const path = page.url.pathname;
			if (!map || centeredPath === path) return;
			const ifHidden = keepCamera || tappedPin === selectedSlug || centeredOn === selectedSlug;
			centeredPath = path;
			centeredOn = selectedSlug;
			tappedPin = undefined;
			keepCamera = false;
			requestAnimationFrame(() => map?.showPlace(point, { ifHidden }));
			return;
		}
		if (centeredOn === selectedSlug) return;
		if (previewSlug && (!previews.has(previewSlug) || !previewHeight)) return;
		centeredOn = selectedSlug;
		// After the new insets reach the map.
		requestAnimationFrame(() => map?.flyTo(point));
	});

	// A new place page starts at its top.
	$effect(() => {
		if (placeSlug && panel) panel.scrollTop = 0;
	});

	// Details for the preview.
	$effect(() => {
		const slug = previewSlug;
		if (!slug || previews.has(slug)) return;
		fetchPlaceDetail(createSupabaseClient(), city.id, slug)
			.then((detail) => {
				if (detail) previews.set(slug, detail);
			})
			.catch((error: unknown) => handleError('Could not load the place', error));
	});

	// Fetch the details of the rows on screen that we do not have yet (one request per page).
	$effect(() => {
		const missing = visibleSlugs.filter(
			(slug) => !items.has(slug) && !loading.has(slug) && !failed.has(slug)
		);
		if (!missing.length) return;
		for (const slug of missing) loading.add(slug);
		fetchListItems(createSupabaseClient(), city.id, missing)
			.then((rows) => {
				for (const row of rows) items.set(row.slug, row);
			})
			.catch((error: unknown) => {
				for (const slug of missing) failed.add(slug);
				handleError('Could not load the rows', error);
			})
			.finally(() => {
				for (const slug of missing) loading.delete(slug);
			});
	});

	// Top rated needs the ranking (places with votes); fetched the first time it is chosen.
	$effect(() => {
		if (sort !== 'top' || ranking) return;
		fetchRanking(createSupabaseClient(), city.id)
			.then((result) => (ranking = result))
			.catch((error: unknown) => handleError('Could not load the ranking', error));
	});

	// Rows are back after a reload: scroll the list to where it was, once the pins and the
	// details of the rows on screen have arrived (placeholder rows have another height).
	$effect(() => {
		if (!places || pendingListScroll === undefined || !listScroller) return;
		if (loading.size > 0 || visibleSlugs.some((slug) => !items.has(slug) && !failed.has(slug))) {
			return;
		}
		const top = pendingListScroll;
		pendingListScroll = undefined;
		void tick().then(() =>
			requestAnimationFrame(() => {
				if (listScroller) listScroller.scrollTop = top;
			})
		);
	});

	/** The screen as it was before a language reload. Runs after hydration (onMount). */
	function restoreView(saved: CityViewState) {
		restoredCamera = saved.camera;
		keepCamera = !!saved.camera;
		snap = saved.snap;
		sort = saved.sort;
		certifiedOnly = saved.certifiedOnly;
		origin = saved.origin;
		pages = saved.pages;
		pendingListScroll = saved.listScroll || undefined;
		if (saved.preview && !placeSlug && !desktop) {
			// The map is already on the saved area: do not fly to the place again.
			centeredOn = saved.preview;
			void goto(page.url.href, {
				state: { ...page.state, preview: saved.preview },
				shallow: true,
				replace: true
			});
		}
		if (saved.panelScroll && placeSlug) {
			requestAnimationFrame(() => {
				if (panel) panel.scrollTop = saved.panelScroll;
			});
		}
	}

	onMount(() => {
		const supabase = createSupabaseClient();
		fetchCityPlaces(supabase, city.id)
			.then((collection) => (places = collection))
			.catch((error: unknown) => handleError('Could not load the places', error));
		fetchAreas(supabase, city.id)
			.then((result) => (areas = result))
			.catch((error: unknown) => handleError('Could not load the areas', error));

		const media = window.matchMedia(DESKTOP_QUERY);
		const updateLayout = () => (desktop = media.matches);
		updateLayout();
		media.addEventListener('change', updateLayout);

		const saved = parseCityView(takeStash(CITY_VIEW_KEY), { city: city.slug });
		if (saved) restoreView(saved);
		const stopSaving = onBeforeLeave(() =>
			stash(
				CITY_VIEW_KEY,
				serializeCityView({
					city: city.slug,
					savedAt: Date.now(),
					camera: view ? { center: view.center, zoom: view.zoom } : restoredCamera,
					snap,
					sort,
					certifiedOnly,
					pages,
					origin: $state.snapshot(origin),
					preview: page.state.preview,
					listScroll: listScroller?.scrollTop ?? 0,
					panelScroll: panel?.scrollTop ?? 0
				})
			)
		);

		// No prompt here: only a permission the browser reports as granted. Center on the user
		// only inside the city, never over an area picked on the Home, and never away from the
		// place on a place page or in the preview (the dot still shows).
		void getPositionIfGranted().then((position) => {
			if (!position) return;
			user = [position.lng, position.lat];
			// Back from a language reload: the screen stays where the user left it.
			if (saved) return;
			if (!page.state.area) {
				startFrom({ point: user, kind: 'user' });
				if (isInside(user, city.bounds) && !page.params.place && !page.state.preview) {
					map?.flyTo(user);
				}
			}
		});

		// After an update: the place's pin, row and preview are fetched again (a gray pin turns
		// into a community one, the score moves).
		const stopUpdates = onPlaceUpdated((slug) => {
			items.delete(slug);
			previews.delete(slug);
			failed.delete(slug);
			ranking = undefined;
			fetchCityPlaces(supabase, city.id)
				.then((collection) => (places = collection))
				.catch((error: unknown) => handleError('Could not load the places', error));
		});

		return () => {
			clearTimeout(noticeTimer);
			media.removeEventListener('change', updateLayout);
			stopSaving();
			stopUpdates();
		};
	});

	function handleError(context: string, error: unknown) {
		if (!navigator.onLine) showNotice(m.common_offline());
		else console.error(context, error);
	}

	function showNotice(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = undefined), NOTICE_MS);
	}

	/** New starting point: the list goes back to its first page. */
	function startFrom(next: Origin) {
		origin = next;
		movedByUser = false;
		resetList();
	}

	/** Back to the first page; rows that failed to load may be tried again. */
	function resetList() {
		pages = 1;
		failed.clear();
	}

	async function showMyLocation() {
		locating = true;
		const result = await requestPosition();
		locating = false;
		if (!result.ok) {
			// Nothing blocks: the map and the list stay where they are.
			showNotice(
				result.reason === 'denied' || result.reason === 'unsupported'
					? m.location_denied()
					: m.location_unavailable()
			);
			return;
		}
		user = [result.position.lng, result.position.lat];
		startFrom({ point: user, kind: 'user' });
		map?.flyTo(user);
	}

	const placeHref = (slug: string) => localizeHref(`/${city.slug}/${slug}`);

	function onPinClick(slug: string) {
		if (desktop) tappedPin = slug;
		select(slug);
	}

	/** A pin, a row or a search result: the preview on phones, the place page on desktop. */
	function select(slug: string) {
		if (desktop) {
			// Switching places keeps one history entry, so Back returns to the list.
			void goto(placeHref(slug), { replace: !!placeSlug });
			return;
		}
		void goto(page.url.href, {
			state: { ...page.state, preview: slug },
			shallow: true,
			replace: !!page.state.preview
		});
	}

	function closePreview() {
		if (page.state.preview) history.back();
	}

	/** Back from the page returns to the preview over the map. */
	function openPreviewed() {
		if (previewSlug) void goto(placeHref(previewSlug));
	}

	function onMapMove(next: MapView) {
		view = next;
		if (next.byUser) movedByUser = true;
	}

	function searchThisArea() {
		if (view) startFrom({ point: view.center, kind: 'map' });
	}

	function pickArea(area: AreaSummary) {
		startFrom({ point: boundsCenter(area.bounds), kind: 'area' });
		map?.fitBounds(area.bounds);
		if (!desktop) snap = 'half';
	}

	function setSort(next: Sort) {
		sort = next;
		resetList();
	}

	function toggleCertified() {
		certifiedOnly = !certifiedOnly;
		resetList();
	}

	/** Widen the map to include the certified place nearest to the center of the view. */
	function zoomOutToCertified() {
		if (!places || !view) return;
		const center = view.center;
		const nearest = places.features
			.filter((f) => f.properties.level === 'certified')
			.map((f) => ({
				point: f.geometry.coordinates,
				d: distanceMeters(center, f.geometry.coordinates)
			}))
			.toSorted((a, b) => a.d - b.d)[0];
		if (!nearest) return;
		map?.fitBounds([
			Math.min(center[0], nearest.point[0]),
			Math.min(center[1], nearest.point[1]),
			Math.max(center[0], nearest.point[0]),
			Math.max(center[1], nearest.point[1])
		]);
	}
</script>

{#snippet searchBox(variant: 'overlay' | 'inline')}
	<SearchBox
		{variant}
		{areas}
		{places}
		{origin}
		onpickarea={pickArea}
		onpickplace={select}
		onclose={() => (searchOpen = false)}
	/>
{/snippet}

<div
	class="screen"
	style:--sheet={desktop ? undefined : `${bottomPanel || 260}px`}
	style:--top={`${topBarHeight}px`}
>
	<DesktopBar city={city.name} {certifiedOnly} ontogglecertified={toggleCertified}>
		{#snippet search()}
			{@render searchBox('inline')}
		{/snippet}
	</DesktopBar>

	<!-- Hidden, not removed, under the preview and the place page: it keeps its scroll and rows. -->
	<div class="list" class:away={!!previewSlug || !!placeSlug} inert={!!previewSlug || !!placeSlug}>
		<DraggableSheet
			bind:snap
			bind:scroller={listScroller}
			onheight={(height) => (sheetHeight = height)}
			topOffset={topBarHeight}
			label={m.home_work_nearby()}
		>
			{#snippet header()}
				<div class="heading">
					<h2>{m.home_work_nearby()}</h2>
					<SortControl {sort} onchange={setSort} />
				</div>
			{/snippet}

			{#if !placeSlug}
				<h1 class="visually-hidden">{m.city_meta_title({ city: city.name })}</h1>
			{/if}
			<LaunchMessage {city} />
			{#if noCertifiedInView}
				<NoCertified
					unchecked={uncheckedInView}
					onshowall={toggleCertified}
					onzoomout={hasCertified ? zoomOutToCertified : undefined}
				/>
			{:else if sections}
				<PlaceList
					sections={visible}
					{items}
					citySlug={city.slug}
					{sort}
					showDistance={origin.kind === 'user'}
					selected={selectedSlug}
					{hasMore}
					onselect={select}
					onshowmore={() => pages++}
				/>
			{/if}
		</DraggableSheet>
	</div>

	<div class="map-area" inert={!!placeSlug && !desktop}>
		{#if mapWanted}
			<CityMap
				bind:this={map}
				center={restoredCamera?.center ?? openPlace?.point ?? city.center}
				zoom={restoredCamera?.zoom ?? (openPlace ? 15 : undefined)}
				bounds={restoredCamera ? undefined : page.state.area}
				{places}
				{user}
				{insets}
				{certifiedOnly}
				{selected}
				onplaceclick={onPinClick}
				onmove={onMapMove}
			/>
		{/if}
		<TopBar
			{certifiedOnly}
			solid={snap === 'full'}
			bind:height={topBarHeight}
			onsearch={() => (searchOpen = true)}
			ontogglecertified={toggleCertified}
		/>
		{#if showSearchArea}
			<button class="search-area" type="button" onclick={searchThisArea}>
				{m.action_search_area()}
			</button>
		{/if}
		<LocationButton busy={locating} onclick={showMyLocation} />
		<div class="zoom">
			<button type="button" aria-label={m.map_zoom_in()} onclick={() => map?.zoomIn()}>+</button>
			<button type="button" aria-label={m.map_zoom_out()} onclick={() => map?.zoomOut()}>−</button>
		</div>
		{#if notice}
			<p class="notice" role="status">{notice}</p>
		{/if}
	</div>

	{#if previewSlug}
		<div class="preview-layer">
			<BottomSheet label={m.place_preview()} bind:height={previewHeight}>
				<PlacePreview
					name={selected?.properties.name ?? ''}
					level={selected?.properties.level ?? 'osm_only'}
					place={previews.get(previewSlug)}
					distance={user && selected
						? distanceMeters(user, selected.geometry.coordinates)
						: undefined}
					href={placeHref(previewSlug)}
					onopen={openPreviewed}
					onclose={closePreview}
				/>
			</BottomSheet>
		</div>
	{/if}

	<!-- The place page: full screen on phones, the left panel on desktop. -->
	<div class="place-panel" class:open={!!placeSlug} bind:this={panel}>
		{@render children()}
	</div>

	{#if snap === 'full' && !desktop && !previewSlug && !placeSlug}
		<button class="map-button" type="button" onclick={() => (snap = 'half')}>
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
				><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"></path></svg
			>
			{m.common_map()}
		</button>
	{/if}

	{#if searchOpen && !desktop}
		{@render searchBox('overlay')}
	{/if}
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		overflow: hidden;
		/* Not even code may scroll it: scrollIntoView in the form would push the desktop bar away. */
		overflow: clip;
		--attribution-bottom: calc(var(--sheet, 260px) + 12px);
		--bottom: calc(var(--sheet, 260px) + 16px);
	}

	.map-area {
		position: absolute;
		inset: 0;
	}

	.list {
		display: contents;
	}

	.list.away > :global(.sheet) {
		visibility: hidden;
	}

	.preview-layer {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 8;
	}

	.place-panel {
		display: none;
	}

	.place-panel.open {
		display: block;
		position: fixed;
		inset: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--bg);
		z-index: 20;
	}

	.heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding-bottom: 10px;
	}

	h2 {
		margin: 0;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: var(--tracking-title);
	}

	.search-area {
		position: absolute;
		top: calc(var(--top) + 4px);
		left: 50%;
		transform: translateX(-50%);
		padding: 10px 16px;
		border: 0;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: 0 3px 12px var(--sh-3);
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		z-index: 4;
	}

	.zoom {
		display: none;
	}

	.notice {
		position: absolute;
		left: var(--gutter);
		right: 76px;
		bottom: calc(var(--bottom) + 16px);
		margin: 0;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-size: 14px;
		line-height: 1.4;
		box-shadow: 0 3px 12px var(--sh-4);
		z-index: 4;
	}

	.map-button {
		position: absolute;
		left: 50%;
		bottom: 28px;
		transform: translateX(-50%);
		height: 48px;
		padding: 0 20px;
		border: 0;
		border-radius: 24px;
		background: var(--btn);
		color: var(--btnfg);
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 700;
		box-shadow: 0 6px 18px var(--sh-3);
		z-index: 7;
		cursor: pointer;
	}

	@media (min-width: 1024px) {
		.screen {
			display: grid;
			grid-template-columns: 460px 1fr;
			grid-template-rows: auto minmax(0, 1fr);
			--attribution-bottom: 12px;
			--bottom: 128px;
		}

		.map-area {
			position: relative;
			min-height: 0;
		}

		/* Over the list column, below the top bar (LatteDesktop). */
		.place-panel.open {
			position: absolute;
			top: 76px;
			right: auto;
			width: 460px;
			border-right: 1px solid var(--line);
			z-index: 9;
		}

		.search-area {
			top: 20px;
		}

		.zoom {
			position: absolute;
			right: 20px;
			bottom: 20px;
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.zoom button {
			width: 44px;
			height: 44px;
			border: 0;
			border-radius: 12px;
			background: var(--surface);
			box-shadow: 0 2px 8px var(--sh-3);
			font-size: 20px;
			color: var(--ink);
			cursor: pointer;
		}
	}
</style>
