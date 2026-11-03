/**
 * List rows and Top rated ranking (supabase/migrations/20261012120000_place_list.sql).
 * Only the rows on screen are fetched; ordering by distance happens in the browser.
 */
import type { LngLat, PlaceLevel } from '#lib/map/index.ts';
import { isPhotoPath } from '#lib/photos/urls.ts';
import type { createSupabaseClient } from './client.ts';
import type { Database } from './database.types.ts';

type Client = ReturnType<typeof createSupabaseClient>;
type ItemRow = Database['public']['Views']['place_list_items']['Row'];

export type Wifi = 'none' | 'slow' | 'fast';
/** What a place can show: also 'available', the team's "there is Wi‑Fi" (never an answer of the form). */
export type ShownWifi = Wifi | 'available';
export type Outlets = 'none' | 'a_few' | 'plenty';
export type Noise = 'quiet' | 'noisy';
export type LaptopRule = 'no_laptops_lunch' | 'no_laptops_weekends' | 'time_limit';

export type ListItem = {
	slug: string;
	name: string;
	level: PlaceLevel;
	/** From OSM: a cup for cafés, a glass for bars; null when unknown. */
	amenity: 'cafe' | 'bar' | null;
	point: LngLat;
	neighborhood: string | null;
	openingHours: string | null;
	timezone: string;
	votes: number;
	yesVotes: number;
	scorePct: number | null;
	/** Enough votes to show a percentage (certification_settings.score_min_votes). */
	hasScore: boolean;
	/** The community's value, else the team's on a certified place. */
	wifi: ShownWifi | null;
	outlets: Outlets | null;
	noise: Noise | null;
	laptopRules: LaptopRule[];
	/** The latest visible photo (its thumbnail is the row's cover), or null. */
	coverPath: string | null;
};

export type RankedPlace = {
	slug: string;
	votes: number;
	wilson: number;
	section: 'rated' | 'few_votes';
};

const ITEM_COLUMNS =
	'slug, name, level, amenity, lng, lat, neighborhood, opening_hours, timezone, votes, yes_votes, score_pct, has_score, wifi, outlets, noise, laptop_rules, cover_path';
/** Rows per request: one page of the list. */
export const PAGE_SIZE = 20;

export function toListItem(row: Omit<ItemRow, 'city_id'>): ListItem {
	return {
		slug: row.slug ?? '',
		name: row.name ?? '',
		level: row.level ?? 'osm_only',
		amenity: row.amenity,
		point: [row.lng ?? 0, row.lat ?? 0],
		neighborhood: row.neighborhood,
		openingHours: row.opening_hours,
		timezone: row.timezone ?? 'UTC',
		votes: row.votes ?? 0,
		yesVotes: row.yes_votes ?? 0,
		scorePct: row.score_pct,
		hasScore: row.has_score ?? false,
		wifi: row.wifi as ShownWifi | null,
		outlets: row.outlets as Outlets | null,
		noise: row.noise as Noise | null,
		laptopRules: (row.laptop_rules ?? []) as LaptopRule[],
		coverPath: isPhotoPath(row.cover_path) ? row.cover_path : null
	};
}

/** Rows for the given places (one page at most). */
export async function fetchListItems(
	supabase: Client,
	cityId: string,
	slugs: string[]
): Promise<ListItem[]> {
	if (!slugs.length) return [];
	const { data, error } = await supabase
		.from('place_list_items')
		.select(ITEM_COLUMNS)
		.eq('city_id', cityId)
		.in('slug', slugs);
	if (error) throw new Error(error.message);
	return data.map(toListItem);
}

/** The rows nearest to the city center, for the server-rendered list (no user position). */
export async function fetchCenterItems(
	supabase: Client,
	cityId: string,
	certifiedOnly = false
): Promise<ListItem[]> {
	const { data, error } = await supabase
		.rpc('city_center_places', {
			p_city_id: cityId,
			p_limit: PAGE_SIZE,
			p_certified_only: certifiedOnly
		})
		.select(ITEM_COLUMNS);
	if (error) throw new Error(error.message);
	return data.map(toListItem);
}

/** Places with votes, best first (Wilson lower bound), split into rated / few_votes. */
export async function fetchRanking(supabase: Client, cityId: string): Promise<RankedPlace[]> {
	const { data, error } = await supabase
		.from('city_ranking')
		.select('slug, votes, wilson, section')
		.eq('city_id', cityId)
		.order('wilson', { ascending: false })
		.order('votes', { ascending: false });
	if (error) throw new Error(error.message);
	return data.map((row) => ({
		slug: row.slug ?? '',
		votes: row.votes ?? 0,
		wilson: row.wilson ?? 0,
		section: row.section === 'rated' ? 'rated' : 'few_votes'
	}));
}
