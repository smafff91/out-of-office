<script lang="ts">
	/**
	 * Full-bleed map with the place pins and the user's position. Renders an empty map-colored
	 * area on the server and on first paint; MapLibre loads afterwards (engine.ts).
	 * Position the attribution with the --attribution-bottom CSS variable.
	 */
	import { onMount } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import type { Insets, MapController, MapView } from './engine.ts';
	import type { Bounds, LngLat, PlaceCollection, PlaceFeature } from './types.ts';

	type Props = {
		center: LngLat;
		zoom?: number;
		/** Fitted on load instead of center/zoom when set. */
		bounds?: Bounds;
		places?: PlaceCollection;
		user?: LngLat;
		/** Space covered by the app's own panels, kept free when the map moves to a place. */
		insets?: Insets;
		certifiedOnly?: boolean;
		selected?: PlaceFeature;
		/** False for the small map on place pages: a picture of the spot, not a control. */
		interactive?: boolean;
		onplaceclick?: (slug: string) => void;
		onmove?: (view: MapView) => void;
	};

	let {
		center,
		zoom = 14,
		bounds,
		places,
		user,
		insets = { top: 140, bottom: 220, left: 24, right: 24 },
		certifiedOnly = false,
		selected,
		interactive = true,
		onplaceclick,
		onmove
	}: Props = $props();

	/** How far from the edges of the free area a pin still counts as well in view (px). */
	const VISIBLE_MARGIN = 48;

	let container: HTMLDivElement;
	let controller = $state<MapController>();
	/** A camera move asked for before MapLibre finished loading: applied once it is ready. */
	let pendingMove: ((map: MapController) => void) | undefined;

	onMount(() => {
		let destroyed = false;
		import('./engine.ts')
			.then(({ createMap }) => {
				if (destroyed) return;
				controller = createMap(container, {
					center,
					zoom,
					bounds,
					insets,
					label: m.common_map(),
					interactive,
					onPlaceClick: (slug) => onplaceclick?.(slug),
					onMove: (view) => onmove?.(view)
				});
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

	$effect(() => {
		controller?.setCertifiedOnly(certifiedOnly);
	});

	$effect(() => {
		controller?.setSelected(selected);
	});

	$effect(() => {
		controller?.setInsets(insets);
	});

	function move(action: (map: MapController) => void) {
		if (controller) action(controller);
		else pendingMove = action;
	}

	export function flyTo(target: LngLat, targetZoom?: number) {
		move((map) => map.flyTo(target, targetZoom));
	}

	/**
	 * Centers the map on a place in the free area. With `ifHidden`, only when the place is out of
	 * view or near an edge (the user just tapped its pin, or it is already in place).
	 */
	export function showPlace(target: LngLat, { ifHidden = false } = {}) {
		move((map) => {
			if (!ifHidden || !map.shows(target, VISIBLE_MARGIN)) map.centerOn(target);
		});
	}

	export function fitBounds(target: Bounds) {
		move((map) => map.fitBounds(target));
	}

	export function zoomIn() {
		controller?.zoomIn();
	}

	export function zoomOut() {
		controller?.zoomOut();
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
		left: 8px;
		/* Clear of the "Show my location" button on the right. */
		max-width: calc(100% - 84px);
		bottom: var(--attribution-bottom, 12px);
		margin: 0;
		padding: 2px 6px;
		border-radius: 6px;
		/* Map color, slightly see-through: readable over streets and labels. */
		background: color-mix(in srgb, var(--map) 85%, transparent);
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
