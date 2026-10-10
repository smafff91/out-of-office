/** Map types shared with the rest of the app: no MapLibre types leak out of src/lib/map/. */

export type LngLat = [lng: number, lat: number];

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

export type PlaceLevel = 'osm_only' | 'community' | 'certified';

/** One pin, as returned by the city_map_places() database function. */
export type PlaceFeature = {
	type: 'Feature';
	geometry: { type: 'Point'; coordinates: LngLat };
	properties: { slug: string; name: string; level: PlaceLevel };
};

export type PlaceCollection = { type: 'FeatureCollection'; features: PlaceFeature[] };
