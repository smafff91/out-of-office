/**
 * The only module that imports MapLibre. CityMap.svelte loads it with a dynamic import, so
 * MapLibre and its worker download after the page is on screen, in their own chunks.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { GeoJSONSource, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { certifiedPin, communityPin, PIXEL_RATIO, readPalette, uncheckedPin } from './pins.ts';
import style from './style.json';
import type { Bounds, LngLat, PlaceCollection, PlaceFeature } from './types.ts';

setWorkerUrl(workerUrl);

const PLACES = 'places';
const USER = 'user';
const SELECTED = 'selected';
const PLACE_LAYERS = ['places-certified', 'places-community', 'places-unchecked'];
/** Extra room around a tap, so small pins are easy to hit with a finger. */
const TAP_TOLERANCE = 12;
const LEVEL_RANK: Record<string, number> = { certified: 0, community: 1, osm_only: 2 };
/** Zoom below which "not checked yet" dots are tiny faint specks, and from which they are full. */
const UNCHECKED_TINY_BELOW = 12.5;
const UNCHECKED_FULL_FROM = 14;
const EMPTY: PlaceCollection = { type: 'FeatureCollection', features: [] };

/** Padding kept free around fitted areas: the top bar and the bottom sheet cover the map. */
export type Insets = { top: number; bottom: number; left: number; right: number };

/** What the map shows after each move; byUser is false for moves made in code. */
export type MapView = { center: LngLat; bounds: Bounds; byUser: boolean };

export type MapController = {
	setPlaces(places: PlaceCollection): void;
	setUser(position: LngLat | undefined): void;
	/** Only certified pins (the "Certified for remote work" filter). */
	setCertifiedOnly(on: boolean): void;
	/** Highlights one place: bigger pin with its name. */
	setSelected(place: PlaceFeature | undefined): void;
	setInsets(insets: Insets): void;
	flyTo(center: LngLat, zoom?: number): void;
	fitBounds(bounds: Bounds): void;
	zoomIn(): void;
	zoomOut(): void;
	destroy(): void;
};

export function createMap(
	container: HTMLElement,
	options: {
		center: LngLat;
		zoom: number;
		bounds?: Bounds;
		insets: Insets;
		label: string;
		/** False for the small map on place pages: no panning, zooming or taps. */
		interactive?: boolean;
		onPlaceClick?: (slug: string) => void;
		onMove?: (view: MapView) => void;
	}
): MapController {
	let insets = options.insets;
	const palette = readPalette();
	const map = new MapLibreMap({
		container,
		style: style as StyleSpecification,
		center: options.center,
		zoom: options.zoom,
		interactive: options.interactive ?? true,
		minZoom: 3,
		maxZoom: 19,
		// Our own attribution line is always visible (CityMap.svelte); MapLibre's folds away.
		attributionControl: false,
		dragRotate: false,
		pitchWithRotate: false,
		touchPitch: false,
		fadeDuration: 0
	});
	map.touchZoomRotate.disableRotation();
	map.keyboard.disableRotation();
	map.getCanvas().setAttribute('aria-label', options.label);
	if (options.bounds) map.fitBounds(options.bounds, { padding: options.insets, animate: false });

	let pendingPlaces: PlaceCollection | undefined;
	let pendingUser: LngLat | undefined;
	let pendingSelected: PlaceFeature | undefined;
	let certifiedOnly = false;
	let ready = false;

	map.on('load', () => {
		map.addImage('pin-community', communityPin(palette), { pixelRatio: PIXEL_RATIO });
		map.addImage('pin-certified', certifiedPin(palette), { pixelRatio: PIXEL_RATIO });
		map.addImage('pin-unchecked', uncheckedPin(palette), { pixelRatio: PIXEL_RATIO });

		map.addSource(PLACES, { type: 'geojson', data: pendingPlaces ?? EMPTY });
		map.addSource(USER, { type: 'geojson', data: userData(pendingUser) });
		map.addSource(SELECTED, { type: 'geojson', data: selectedData(pendingSelected) });

		// Not checked yet: small grey-rimmed dots. Thousands of them would cover the whole city
		// when zoomed out, so below UNCHECKED_TINY_BELOW they shrink to faint borderless specks
		// (the city never looks empty), fade in up to UNCHECKED_FULL_FROM and then get their
		// border. Community and certified pins stay fully visible at every zoom.
		// Zoom must be the input of a top-level interpolate (MapLibre rule), so every property
		// is one curve: below UNCHECKED_TINY_BELOW the values are clamped to the first stop.
		const byZoom = (...stops: (number | string)[]) =>
			['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;
		map.addLayer({
			id: 'places-unchecked',
			type: 'circle',
			source: PLACES,
			filter: ['==', ['get', 'level'], 'osm_only'],
			paint: {
				// Specks are filled grey (a white dot without its border would vanish), turning
				// white with a grey border by zoom 13.
				'circle-color': byZoom(UNCHECKED_TINY_BELOW, palette.dot, 13, palette.dotbg),
				'circle-stroke-color': palette.dot,
				// ~3.5 px wide when tiny, 5 px at zoom 13, 8 px at zoom 15.
				'circle-radius': byZoom(UNCHECKED_TINY_BELOW, 1.75, 13, 2.5, 15, 4),
				'circle-stroke-width': byZoom(UNCHECKED_TINY_BELOW, 0, 13, 1.5, 15, 2),
				'circle-opacity': byZoom(UNCHECKED_TINY_BELOW, 0.35, 13, 0.45, UNCHECKED_FULL_FROM, 1),
				'circle-stroke-opacity': byZoom(UNCHECKED_TINY_BELOW, 0, 13, 0.45, UNCHECKED_FULL_FROM, 1)
			}
		});

		// Layer order sets what wins when pins overlap: dots < community < certified (the only
		// level that uses crema) < the user's position. No clustering for now.
		for (const level of ['community', 'certified'] as const) {
			map.addLayer({
				id: `places-${level}`,
				type: 'symbol',
				source: PLACES,
				filter: ['==', ['get', 'level'], level],
				layout: {
					'icon-image': `pin-${level}`,
					'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 14, 1],
					'icon-allow-overlap': true,
					'icon-ignore-placement': true
				}
			});
		}

		// The selected place: its pin, bigger, with the name beside it (LatteHome).
		map.addLayer({
			id: 'selected-pin',
			type: 'symbol',
			source: SELECTED,
			layout: {
				'icon-image': [
					'match',
					['get', 'level'],
					'certified',
					'pin-certified',
					'community',
					'pin-community',
					'pin-unchecked'
				],
				'icon-size': 1.25,
				'icon-allow-overlap': true,
				'icon-ignore-placement': true,
				'text-field': ['get', 'name'],
				'text-font': ['Noto Sans Bold'],
				'text-size': 13,
				'text-anchor': 'left',
				'text-offset': [1.9, 0],
				'text-optional': true,
				'text-allow-overlap': true
			},
			paint: {
				'text-color': palette.ink,
				'text-halo-color': palette.surface,
				'text-halo-width': 2
			}
		});

		// The user's position: espresso ring on white, with a crema halo.
		map.addLayer({
			id: 'user-halo',
			type: 'circle',
			source: USER,
			paint: { 'circle-radius': 18, 'circle-color': palette.meHalo }
		});
		map.addLayer({
			id: 'user-dot',
			type: 'circle',
			source: USER,
			paint: {
				'circle-radius': 4,
				'circle-color': palette.surface,
				'circle-stroke-width': 5,
				'circle-stroke-color': palette.me
			}
		});

		ready = true;
		applyCertifiedOnly();
		report(false);
	});

	// Taps: the highest-level pin near the finger wins (certified, then community, then dots).
	map.on('click', (event) => {
		if (!ready || !options.onPlaceClick) return;
		const { x, y } = event.point;
		const layers = certifiedOnly ? ['places-certified'] : PLACE_LAYERS;
		const hits = map.queryRenderedFeatures(
			[
				[x - TAP_TOLERANCE, y - TAP_TOLERANCE],
				[x + TAP_TOLERANCE, y + TAP_TOLERANCE]
			],
			{ layers }
		);
		const best = hits.toSorted(
			(a, b) => LEVEL_RANK[a.properties.level] - LEVEL_RANK[b.properties.level]
		)[0];
		if (best) options.onPlaceClick(String(best.properties.slug));
	});
	for (const layer of PLACE_LAYERS) {
		map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
		map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
	}

	// Moves made by the user carry the original browser event; flyTo/fitBounds do not.
	map.on('moveend', (event) => report('originalEvent' in event && !!event.originalEvent));

	function report(byUser: boolean) {
		const center = map.getCenter();
		const b = map.getBounds();
		options.onMove?.({
			center: [center.lng, center.lat],
			bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
			byUser
		});
	}

	function applyCertifiedOnly() {
		const visibility = certifiedOnly ? 'none' : 'visible';
		map.setLayoutProperty('places-unchecked', 'visibility', visibility);
		map.setLayoutProperty('places-community', 'visibility', visibility);
	}

	function source(id: string) {
		return map.getSource<GeoJSONSource>(id);
	}

	return {
		setPlaces(places) {
			pendingPlaces = places;
			if (ready) source(PLACES)?.setData(places);
		},
		setUser(position) {
			pendingUser = position;
			if (ready) source(USER)?.setData(userData(position));
		},
		setCertifiedOnly(on) {
			certifiedOnly = on;
			if (ready) applyCertifiedOnly();
		},
		setSelected(place) {
			pendingSelected = place;
			if (ready) source(SELECTED)?.setData(selectedData(place));
		},
		setInsets(next) {
			insets = next;
		},
		flyTo(center, zoom) {
			map.flyTo({
				center,
				zoom: zoom ?? Math.max(map.getZoom(), 15),
				padding: insets,
				essential: true
			});
		},
		fitBounds(bounds) {
			map.fitBounds(bounds, { padding: insets, essential: true, maxZoom: 16 });
		},
		zoomIn() {
			map.zoomIn();
		},
		zoomOut() {
			map.zoomOut();
		},
		destroy() {
			map.remove();
		}
	};
}

function selectedData(place: PlaceFeature | undefined): PlaceCollection {
	return { type: 'FeatureCollection', features: place ? [place] : [] };
}

function userData(position: LngLat | undefined) {
	return {
		type: 'FeatureCollection' as const,
		features: position
			? [
					{
						type: 'Feature' as const,
						geometry: { type: 'Point' as const, coordinates: position },
						properties: {}
					}
				]
			: []
	};
}
