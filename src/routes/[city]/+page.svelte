<script lang="ts">
	// City map and list (LatteHome, LatteList, LatteNoResults, LatteDesktop).
	// - Ordering, the Certified filter and search run in the browser on the map pins: the user's
	//   position never leaves the device. Only the rows on screen are fetched (20 at a time).
	// - Location is never requested automatically here: the user's dot appears only if the
	//   browser reports the permission as granted, or after "Show my location".
	// - Nearest starts from the user, else the picked area, else the city center; distances are
	//   shown only for the user's real position.
	import { onMount, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/state';
	import DesktopBar from '#lib/components/home/DesktopBar.svelte';
	import DraggableSheet, { type Snap } from '#lib/components/home/DraggableSheet.svelte';
	import LaunchMessage from '#lib/components/home/LaunchMessage.svelte';
	import LocationButton from '#lib/components/home/LocationButton.svelte';
	import NoCertified from '#lib/components/home/NoCertified.svelte';
	import PlaceList from '#lib/components/home/PlaceList.svelte';
	import SearchBox from '#lib/components/home/SearchBox.svelte';
	import SortControl from '#lib/components/home/SortControl.svelte';
	import TopBar from '#lib/components/home/TopBar.svelte';
	import { APP_NAME } from '#lib/config.ts';
	import {
		CityMap,
		isInside,
		type Bounds,
		type Insets,
		type LngLat,
		type MapView,
		type PlaceCollection
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
	import { getPositionIfGranted, requestPosition } from '#lib/platform/geolocation.ts';
	import { fetchAreas, fetchCityPlaces, type AreaSummary } from '#lib/supabase/cities.ts';
	import { createSupabaseClient } from '#lib/supabase/client.ts';
	import {
		fetchListItems,
		fetchRanking,
		PAGE_SIZE,
		type ListItem,
		type RankedPlace
	} from '#lib/supabase/places.ts';
	import type { PageProps } from './$types';

	const NOTICE_MS = 5000;
	/** "Search this area" appears once the map center is this far from where the list starts. */
	const SEARCH_AREA_MIN_METERS = 300;
	const DESKTOP_QUERY = '(min-width: 1024px)';

	let { data }: PageProps = $props();
	const city = $derived(data.city);

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
	let certifiedOnly = $state(false);
	let selectedSlug = $state<string>();
	let pages = $state(1);
	let view = $state<MapView>();
	let movedByUser = $state(false);
	let searchOpen = $state(false);
	let snap = $state<Snap>('half');
	let sheetHeight = $state(0);
	let topBarHeight = $state(128);
	let desktop = $state(false);
	let locating = $state(false);
	let notice = $state<string>();
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	// Row details already fetched (first page from the server), and those on their way.
	const items = new SvelteMap<string, ListItem>(
		untrack(() => data.centerItems.map((item) => [item.slug, item]))
	);
	const loading = new SvelteSet<string>();
	/** Rows whose request failed: not retried until the list changes (no request loops). */
	const failed = new SvelteSet<string>();

	const sections = $derived.by((): Section[] | undefined => {
		if (places) return buildSections(places, { origin, sort, certifiedOnly, ranking });
		// Before the pins arrive (and on the server): the rows nearest to the city center.
		if (sort !== 'nearest' || certifiedOnly) return undefined;
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

	const selected = $derived(
		selectedSlug ? places?.features.find((f) => f.properties.slug === selectedSlug) : undefined
	);

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

	const insets = $derived<Insets>(
		desktop
			? { top: 32, bottom: 32, left: 32, right: 32 }
			: { top: topBarHeight + 16, bottom: sheetHeight + 16, left: 24, right: 24 }
	);

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

		// No prompt here: only a permission the browser reports as granted. Center on the user
		// only inside the city, and never over an area picked on the Home.
		// (Place pages, feature 6: show the dot too, but keep the map on the place.)
		void getPositionIfGranted().then((position) => {
			if (!position) return;
			user = [position.lng, position.lat];
			if (!page.state.area) {
				startFrom({ point: user, kind: 'user' });
				if (isInside(user, city.bounds)) map?.flyTo(user);
			}
		});

		return () => {
			clearTimeout(noticeTimer);
			media.removeEventListener('change', updateLayout);
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

	function select(slug: string) {
		const feature = places?.features.find((f) => f.properties.slug === slug);
		selectedSlug = slug;
		if (!feature) return;
		// Keep the map visible on phones.
		if (!desktop && snap === 'full') snap = 'half';
		map?.flyTo(feature.geometry.coordinates);
	}

	function onPinClick(slug: string) {
		select(slug);
		if (!desktop && snap === 'closed') snap = 'half';
		// Bring the row into view when it is in the list.
		requestAnimationFrame(() =>
			document
				.querySelector(`.row[data-slug="${CSS.escape(slug)}"]`)
				?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		);
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

<svelte:head>
	<title>{m.city_meta_title({ city: city.name })} · {APP_NAME}</title>
	<meta name="description" content={m.city_meta_description({ city: city.name })} />
</svelte:head>

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
	style:--sheet={desktop ? undefined : `${sheetHeight || 260}px`}
	style:--top={`${topBarHeight}px`}
>
	<DesktopBar city={city.name} {certifiedOnly} ontogglecertified={toggleCertified}>
		{#snippet search()}
			{@render searchBox('inline')}
		{/snippet}
	</DesktopBar>

	<DraggableSheet
		bind:snap
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

		<h1 class="visually-hidden">{m.city_meta_title({ city: city.name })}</h1>
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

	<div class="map-area">
		<CityMap
			bind:this={map}
			center={city.center}
			bounds={page.state.area}
			{places}
			{user}
			{insets}
			{certifiedOnly}
			{selected}
			onplaceclick={onPinClick}
			onmove={onMapMove}
		/>
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

	{#if snap === 'full' && !desktop}
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
		--attribution-bottom: calc(var(--sheet, 260px) + 12px);
		--bottom: calc(var(--sheet, 260px) + 16px);
	}

	.map-area {
		position: absolute;
		inset: 0;
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
