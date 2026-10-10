<script lang="ts">
	// City map (LatteHome / LatteHomeDay1). Location is never requested automatically here:
	// the user's dot appears only if permission was already granted explicitly, or after
	// "Show my location". Without a position, sorting (feature 5) starts from the city center.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import BottomSheet from '#lib/components/home/BottomSheet.svelte';
	import LaunchMessage from '#lib/components/home/LaunchMessage.svelte';
	import LocationButton from '#lib/components/home/LocationButton.svelte';
	import TopBar from '#lib/components/home/TopBar.svelte';
	import { APP_NAME } from '#lib/config.ts';
	import { CityMap, isInside, type LngLat, type PlaceCollection } from '#lib/map/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { getPositionIfGranted, requestPosition } from '#lib/platform/geolocation.ts';
	import { fetchCityPlaces } from '#lib/supabase/cities.ts';
	import { createSupabaseClient } from '#lib/supabase/client.ts';
	import type { PageProps } from './$types';

	const NOTICE_MS = 5000;

	let { data }: PageProps = $props();
	const city = $derived(data.city);

	let map = $state<ReturnType<typeof CityMap>>();
	let places = $state<PlaceCollection>();
	let user = $state<LngLat>();
	let locating = $state(false);
	let notice = $state<string>();
	let sheetHeight = $state(0);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	function showNotice(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = undefined), NOTICE_MS);
	}

	onMount(() => {
		fetchCityPlaces(createSupabaseClient(), city.id)
			.then((collection) => (places = collection))
			.catch((error: unknown) => {
				if (!navigator.onLine) showNotice(m.common_offline());
				else console.error('Could not load the places', error);
			});

		// No prompt here: only a permission the browser reports as granted. Center on the user
		// only inside the city, and never over an area picked on the Home.
		// (Place pages, feature 6: show the dot too, but keep the map on the place.)
		void getPositionIfGranted().then((position) => {
			if (!position) return;
			user = [position.lng, position.lat];
			if (!page.state.area && isInside(user, city.bounds)) map?.flyTo(user);
		});

		return () => clearTimeout(noticeTimer);
	});

	async function showMyLocation() {
		locating = true;
		const result = await requestPosition();
		locating = false;
		if (!result.ok) {
			// Nothing blocks: the map stays where it is.
			showNotice(
				result.reason === 'denied' || result.reason === 'unsupported'
					? m.location_denied()
					: m.location_unavailable()
			);
			return;
		}
		user = [result.position.lng, result.position.lat];
		map?.flyTo(user);
	}
</script>

<svelte:head>
	<title>{m.city_meta_title({ city: city.name })} · {APP_NAME}</title>
	<meta name="description" content={m.city_meta_description({ city: city.name })} />
</svelte:head>

<div class="screen" style:--sheet={sheetHeight ? `${sheetHeight}px` : undefined}>
	<CityMap bind:this={map} center={city.center} bounds={page.state.area} {places} {user} />
	<TopBar />
	<LocationButton busy={locating} onclick={showMyLocation} />
	{#if notice}
		<p class="notice" role="status">{notice}</p>
	{/if}

	<BottomSheet label={m.home_work_nearby()} bind:height={sheetHeight}>
		<h1 class="visually-hidden">{m.city_meta_title({ city: city.name })}</h1>
		<LaunchMessage {city} />
		<div class="heading">
			<h2>{m.home_work_nearby()}</h2>
			<span>{m.common_places_count({ count: city.places })}</span>
		</div>
		<!-- Feature 5: the list (Nearest / Top rated) goes here. -->
	</BottomSheet>
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		overflow: hidden;
		--attribution-bottom: calc(var(--sheet, 120px) + 12px);
		--bottom: calc(var(--sheet, 120px) + 16px);
	}

	.heading {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}

	h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: var(--tracking-title);
	}

	.heading span {
		font-size: 13px;
		color: var(--muted);
	}

	.notice {
		position: absolute;
		left: var(--gutter);
		right: 76px;
		bottom: calc(var(--sheet, 120px) + 32px);
		margin: 0;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-size: 14px;
		line-height: 1.4;
		box-shadow: 0 3px 12px var(--sh-4);
	}
</style>
