/**
 * The only module that imports MapLibre. CityMap.svelte loads it with a dynamic import, so
 * MapLibre and its worker download after the page is on screen, in their own chunks.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { GeoJSONSource, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { certifiedPin, communityPin, PIXEL_RATIO, readPalette } from './pins.ts';
import style from './style.json';
import type { Bounds, LngLat, PlaceCollection } from './types.ts';

setWorkerUrl(workerUrl);

const PLACES = 'places';
const USER = 'user';
/** Zoom below which "not checked yet" dots are hidden, and from which they are fully opaque. */
const UNCHECKED_HIDDEN_BELOW = 12.5;
const UNCHECKED_FULL_FROM = 14;
const EMPTY: PlaceCollection = { type: 'FeatureCollection', features: [] };

/** Padding kept free around fitted areas: the top bar and the bottom sheet cover the map. */
export type Insets = { top: number; bottom: number; left: number; right: number };

export type MapController = {
	setPlaces(places: PlaceCollection): void;
	setUser(position: LngLat | undefined): void;
	flyTo(center: LngLat, zoom?: number): void;
	fitBounds(bounds: Bounds): void;
	destroy(): void;
};

export function createMap(
	container: HTMLElement,
	options: { center: LngLat; zoom: number; bounds?: Bounds; insets: Insets; label: string }
): MapController {
	const palette = readPalette();
	const map = new MapLibreMap({
		container,
		style: style as StyleSpecification,
		center: options.center,
		zoom: options.zoom,
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
	let ready = false;

	map.on('load', () => {
		map.addImage('pin-community', communityPin(palette), { pixelRatio: PIXEL_RATIO });
		map.addImage('pin-certified', certifiedPin(palette), { pixelRatio: PIXEL_RATIO });

		map.addSource(PLACES, { type: 'geojson', data: pendingPlaces ?? EMPTY });
		map.addSource(USER, { type: 'geojson', data: userData(pendingUser) });

		// Not checked yet: small grey-rimmed dots. Thousands of them would cover the whole city
		// when zoomed out, so they fade in from UNCHECKED_HIDDEN_BELOW to UNCHECKED_FULL_FROM;
		// community and certified pins stay visible at every zoom.
		const uncheckedOpacity = [
			'interpolate',
			['linear'],
			['zoom'],
			UNCHECKED_HIDDEN_BELOW,
			0,
			13,
			0.45,
			UNCHECKED_FULL_FROM,
			1
		] as ExpressionSpecification;
		map.addLayer({
			id: 'places-unchecked',
			type: 'circle',
			source: PLACES,
			minzoom: UNCHECKED_HIDDEN_BELOW,
			filter: ['==', ['get', 'level'], 'osm_only'],
			paint: {
				'circle-color': palette.dotbg,
				'circle-stroke-color': palette.dot,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 15, 4],
				'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 15, 2],
				'circle-opacity': uncheckedOpacity,
				'circle-stroke-opacity': uncheckedOpacity
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
	});

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
		flyTo(center, zoom = 15) {
			map.flyTo({ center, zoom, padding: options.insets, essential: true });
		},
		fitBounds(bounds) {
			map.fitBounds(bounds, { padding: options.insets, essential: true });
		},
		destroy() {
			map.remove();
		}
	};
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
