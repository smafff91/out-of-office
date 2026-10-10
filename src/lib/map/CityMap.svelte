<script lang="ts">
	/**
	 * Full-bleed map with the place pins and the user's position. Renders an empty map-colored
	 * area on the server and on first paint; MapLibre loads afterwards (engine.ts).
	 * Position the attribution with the --attribution-bottom CSS variable.
	 */
	import { onMount } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import type { Insets, MapController } from './engine.ts';
	import type { Bounds, LngLat, PlaceCollection } from './types.ts';

	type Props = {
		center: LngLat;
		zoom?: number;
		/** Fitted on load instead of center/zoom when set. */
		bounds?: Bounds;
		places?: PlaceCollection;
		user?: LngLat;
		insets?: Insets;
	};

	let {
		center,
		zoom = 14,
		bounds,
		places,
		user,
		insets = { top: 140, bottom: 220, left: 24, right: 24 }
	}: Props = $props();

	let container: HTMLDivElement;
	let controller = $state<MapController>();
	/** A camera move asked for before MapLibre finished loading: applied once it is ready. */
	let pendingMove: ((map: MapController) => void) | undefined;

	onMount(() => {
		let destroyed = false;
		import('./engine.ts')
			.then(({ createMap }) => {
				if (destroyed) return;
				controller = createMap(container, { center, zoom, bounds, insets, label: m.common_map() });
				pendingMove?.(controller);
				pendingMove = undefined;
			})
			.catch((error: unknown) => {
				// No WebGL or the chunk failed to load: the page keeps working without the map.
				console.error('Map unavailable', error);
			});
		return () => {
			destroyed = true;
			controller?.destroy();
		};
	});

	$effect(() => {
		if (controller && places) controller.setPlaces(places);
	});

	$effect(() => {
		controller?.setUser(user);
	});

	function move(action: (map: MapController) => void) {
		if (controller) action(controller);
		else pendingMove = action;
	}

	export function flyTo(target: LngLat, targetZoom?: number) {
		move((map) => map.flyTo(target, targetZoom));
	}

	export function fitBounds(target: Bounds) {
		move((map) => map.fitBounds(target));
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin="anonymous" />
</svelte:head>

<div class="map" bind:this={container}></div>
<p class="attribution">
	<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
		>{m.common_osm_attribution()}</a
	>
	·
	<a href="https://openfreemap.org" target="_blank" rel="noopener">{m.common_tiles_attribution()}</a
	>
</p>

<style>
	.map {
		position: absolute;
		inset: 0;
		background: var(--map);
	}

	.attribution {
		position: absolute;
		left: 12px;
		right: 76px;
		bottom: var(--attribution-bottom, 12px);
		margin: 0;
		font-family: var(--font-mono);
		font-size: 10px;
		line-height: 1.4;
		color: var(--muted);
		pointer-events: none;
	}

	.attribution a {
		text-decoration: none;
		pointer-events: auto;
	}
</style>
