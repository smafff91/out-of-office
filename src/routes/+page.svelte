<script lang="ts">
	// Home. The server-rendered page is useful on its own (what the app is + links to the open
	// cities); in the browser it asks for the location right away:
	// - inside an open city (or within 25 km) → that city's map, on the user;
	// - elsewhere → "We're not in your area yet" with the open cities;
	// - location off → area choice (LatteLocationOff); with one open city, no city choice.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import AreaPicker from '#lib/components/home/AreaPicker.svelte';
	import BottomSheet from '#lib/components/home/BottomSheet.svelte';
	import CityLinks from '#lib/components/home/CityLinks.svelte';
	import { APP_NAME } from '#lib/config.ts';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import { CityMap } from '#lib/map/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { requestPosition, type PositionResult } from '#lib/platform/geolocation.ts';
	import { fetchAreas, locateCity, type AreaSummary } from '#lib/supabase/cities.ts';
	import { createSupabaseClient } from '#lib/supabase/client.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let phase = $state<'locating' | 'off' | 'outside'>('locating');
	let areas = $state<AreaSummary[]>([]);
	let retrying = $state(false);
	let notice = $state<string>();

	const onlyCity = $derived(data.cities.length === 1 ? data.cities[0] : undefined);
	const backdrop = $derived(data.cities[0]);

	onMount(() => {
		void requestPosition().then(handlePosition);
	});

	async function handlePosition(result: PositionResult) {
		if (!result.ok) {
			if (phase === 'off') {
				notice =
					result.reason === 'denied' || result.reason === 'unsupported'
						? m.location_denied()
						: m.location_unavailable();
			}
			await showAreas();
			return;
		}

		let slug: string | undefined;
		try {
			slug = await locateCity(createSupabaseClient(), result.position);
		} catch (error) {
			console.error('Could not locate the city', error);
			await showAreas();
			return;
		}
		// The position stays in memory (platform/geolocation.ts): the city map shows it at once.
		if (slug) await goto(localizeHref(`/${slug}`), { replace: true });
		else phase = 'outside';
	}

	async function showAreas() {
		phase = 'off';
		if (!onlyCity || areas.length) return;
		try {
			areas = await fetchAreas(createSupabaseClient(), onlyCity.id);
		} catch (error) {
			console.error('Could not load the areas', error);
		}
	}

	async function useMyLocation() {
		retrying = true;
		notice = undefined;
		await handlePosition(await requestPosition());
		retrying = false;
	}

	function pickArea(area: AreaSummary) {
		if (onlyCity) void goto(localizeHref(`/${onlyCity.slug}`), { state: { area: area.bounds } });
	}
</script>

<svelte:head>
	<title>{APP_NAME} · {m.home_meta_title()}</title>
	<meta name="description" content={m.home_meta_description()} />
</svelte:head>

<div class="screen">
	{#if backdrop}
		<CityMap center={backdrop.center} zoom={13} />
	{/if}

	<BottomSheet label={APP_NAME}>
		{#if phase === 'off'}
			<div class="intro">
				<h1>{m.location_off_title()}</h1>
				<p>{m.location_off_body()}</p>
			</div>
			<button class="primary" type="button" disabled={retrying} onclick={useMyLocation}>
				<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
					><path d="M3 11l18-8-8 18-2-8z"></path></svg
				>
				{m.action_use_my_location()}
			</button>
			{#if notice}
				<p class="notice" role="status">{notice}</p>
			{/if}
			{#if onlyCity}
				<AreaPicker city={onlyCity.name} {areas} onpick={pickArea} />
			{:else}
				<CityLinks cities={data.cities} />
			{/if}
		{:else if phase === 'outside'}
			<div class="intro">
				<h1>{m.city_not_in_area()}</h1>
				<p>{m.city_not_in_area_body()}</p>
			</div>
			<!-- Feature 10: the user's city name, the vote and its progress bar. -->
			<CityLinks cities={data.cities} />
		{:else}
			<p class="status" role="status">{m.home_locating()}</p>
			<div class="intro">
				<h1>{m.home_meta_title()}</h1>
				<p>{m.home_intro()}</p>
			</div>
			<CityLinks cities={data.cities} />
		{/if}
	</BottomSheet>
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		overflow: hidden;
		--attribution-bottom: calc(100dvh - 28px);
	}

	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 6px;
	}

	h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.intro p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
	}

	.status {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
	}

	.primary {
		height: var(--btn-height);
		border: 0;
		border-radius: var(--radius);
		background: var(--btn);
		color: var(--btnfg);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.primary:disabled {
		cursor: progress;
		opacity: 0.7;
	}

	.notice {
		margin: 0;
		font-size: 14px;
		line-height: 1.4;
		color: var(--danger);
	}
</style>
