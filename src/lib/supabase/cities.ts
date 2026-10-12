/**
 * Cities, neighborhoods and map pins for the Home. Reads only the public views and functions
 * (supabase/migrations/20261010120000_home_map.sql).
 */
import type { Bounds, LngLat, PlaceCollection } from '#lib/map/index.ts';
import type { createSupabaseClient } from './client.ts';
import type { Database } from './database.types.ts';

type Client = ReturnType<typeof createSupabaseClient>;
type CityRow = Database['public']['Views']['city_summaries']['Row'];
type NeighborhoodRow = Database['public']['Views']['neighborhood_summaries']['Row'];

export type CitySummary = {
	id: string;
	slug: string;
	name: string;
	center: LngLat;
	bounds: Bounds;
	certified: number;
	community: number;
	unchecked: number;
	places: number;
};

export type AreaSummary = {
	id: string;
	name: string;
	bounds: Bounds;
	certified: number;
	places: number;
	/** The district the neighborhood belongs to (from the OSM boundaries). */
	districtId: string | null;
	districtName: string | null;
};

const CITY_COLUMNS =
	'id, slug, name, center_lng, center_lat, west, south, east, north, certified_count, community_count, unchecked_count, places_count';

const bounds = (row: {
	west: number | null;
	south: number | null;
	east: number | null;
	north: number | null;
}): Bounds => [row.west ?? 0, row.south ?? 0, row.east ?? 0, row.north ?? 0];

function toCity(row: CityRow): CitySummary {
	return {
		id: row.id ?? '',
		slug: row.slug ?? '',
		name: row.name ?? '',
		center: [row.center_lng ?? 0, row.center_lat ?? 0],
		bounds: bounds(row),
		certified: row.certified_count ?? 0,
		community: row.community_count ?? 0,
		unchecked: row.unchecked_count ?? 0,
		places: row.places_count ?? 0
	};
}

function toArea(row: Omit<NeighborhoodRow, 'city_id'>): AreaSummary {
	return {
		id: row.id ?? '',
		name: row.name ?? '',
		bounds: bounds(row),
		certified: row.certified_count ?? 0,
		places: row.places_count ?? 0,
		districtId: row.district_id,
		districtName: row.district_name
	};
}

/** Active cities, by name. */
export async function fetchActiveCities(supabase: Client): Promise<CitySummary[]> {
	const { data, error } = await supabase.from('city_summaries').select(CITY_COLUMNS).order('name');
	if (error) throw new Error(error.message);
	return data.map(toCity);
}

/** One active city, or undefined if the slug is unknown or the city is not open. */
export async function fetchCity(supabase: Client, slug: string): Promise<CitySummary | undefined> {
	const { data, error } = await supabase
		.from('city_summaries')
		.select(CITY_COLUMNS)
		.eq('slug', slug)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? toCity(data) : undefined;
}

/** All neighborhoods of a city, unsorted. */
export async function fetchAreas(supabase: Client, cityId: string): Promise<AreaSummary[]> {
	const { data, error } = await supabase
		.from('neighborhood_summaries')
		.select(
			'id, name, west, south, east, north, certified_count, places_count, district_id, district_name'
		)
		.eq('city_id', cityId);
	if (error) throw new Error(error.message);
	return data.map(toArea);
}

/** Every visible place of a city as map pins, in one request. */
export async function fetchCityPlaces(supabase: Client, cityId: string): Promise<PlaceCollection> {
	const { data, error } = await supabase.rpc('city_map_places', { p_city_id: cityId });
	if (error) throw new Error(error.message);
	return data as unknown as PlaceCollection;
}

/** ~1 km: enough to tell which city someone is in, without sending their exact position. */
const roundCoordinate = (value: number) => Math.round(value * 100) / 100;

/**
 * Slug of the active city at (or within 25 km of) a position, or undefined.
 * Always a POST (the default for rpc; the database function refuses GET requests):
 * coordinates travel in the body, never in a URL.
 */
export async function locateCity(
	supabase: Client,
	position: { lat: number; lng: number }
): Promise<string | undefined> {
	const { data, error } = await supabase.rpc('locate_city', {
		p_lat: roundCoordinate(position.lat),
		p_lng: roundCoordinate(position.lng)
	});
	if (error) throw new Error(error.message);
	return data ?? undefined;
}
