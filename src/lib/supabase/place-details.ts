/**
 * One place for the tap preview and the place page (supabase/migrations/20261017120000_place_details.sql).
 * Only aggregates: counts, prevailing values and days in the city's timezone.
 */
import type { LngLat, PlaceFeature, PlaceLevel } from '#lib/map/index.ts';
import type { createSupabaseClient } from './client.ts';
import type { Database } from './database.types.ts';
import type { LaptopRule, Noise, Outlets, Wifi } from './places.ts';

type Client = ReturnType<typeof createSupabaseClient>;
type DetailRow = Database['public']['Views']['place_details']['Row'];

const browser = typeof window !== 'undefined';

export type LongStays = 'welcome' | 'not_really';

/** The answer most people gave, how many gave it and the day of the latest one. */
export type Confirmed<T> = { value: T; confirmations: number; lastConfirmedOn: string };

export type PlaceAttributes = {
	wifi?: Confirmed<Wifi>;
	outlets?: Confirmed<Outlets>;
	noise?: Confirmed<Noise>;
	long_stays?: Confirmed<LongStays>;
};

export type ConfirmedRule = { rule: LaptopRule; confirmations: number; lastConfirmedOn: string };

export type PlaceDetail = {
	slug: string;
	name: string;
	amenity: 'cafe' | 'bar' | null;
	level: PlaceLevel;
	/** Certified places only. */
	certOrigin: 'manual' | 'community' | null;
	/** "YYYY-MM-DD", certified places only. */
	certifiedOn: string | null;
	neighborhood: string | null;
	district: string | null;
	address: string | null;
	point: LngLat;
	openingHours: string | null;
	timezone: string;
	/** The OSM internet_access tag, shown as "unconfirmed". */
	internetAccessOsm: string | null;
	osm: { type: string; id: number } | null;
	/** Gone from OpenStreetMap, kept for its contributions. */
	mayHaveClosed: boolean;
	votes: number;
	yesVotes: number;
	scorePct: number | null;
	hasScore: boolean;
	/** Distinct people who contributed. */
	contributors: number;
	/** People needed for automatic certification (certification_settings). */
	minUsers: number;
	attributes: PlaceAttributes;
	laptopRules: ConfirmedRule[];
};

const COLUMNS =
	'slug, name, amenity, level, cert_origin, certified_on, neighborhood, district, address, lng, lat, opening_hours, timezone, internet_access_osm, osm_type, osm_id, may_have_closed, votes, yes_votes, score_pct, has_score, contributors, min_users, attributes, laptop_rules';

/** Contributions change slowly: a preview opened a minute ago is fresh enough for its page. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; detail: PlaceDetail }>();

type RawConfirmed = {
	value?: string;
	rule?: string;
	confirmations: number;
	last_confirmed_on: string;
};

function toConfirmed<T>(raw: RawConfirmed | undefined): Confirmed<T> | undefined {
	if (!raw?.value) return undefined;
	return {
		value: raw.value as T,
		confirmations: raw.confirmations,
		lastConfirmedOn: raw.last_confirmed_on
	};
}

export function toPlaceDetail(row: Omit<DetailRow, 'city_id'>): PlaceDetail {
	const attributes = (row.attributes ?? {}) as Record<string, RawConfirmed>;
	const rules = (row.laptop_rules ?? []) as RawConfirmed[];
	return {
		slug: row.slug ?? '',
		name: row.name ?? '',
		amenity: row.amenity,
		level: row.level ?? 'osm_only',
		certOrigin: row.cert_origin,
		certifiedOn: row.certified_on,
		neighborhood: row.neighborhood,
		district: row.district,
		address: row.address,
		point: [row.lng ?? 0, row.lat ?? 0],
		openingHours: row.opening_hours,
		timezone: row.timezone ?? 'UTC',
		internetAccessOsm: row.internet_access_osm,
		osm: row.osm_type && row.osm_id ? { type: row.osm_type, id: row.osm_id } : null,
		mayHaveClosed: row.may_have_closed ?? false,
		votes: row.votes ?? 0,
		yesVotes: row.yes_votes ?? 0,
		scorePct: row.score_pct,
		hasScore: row.has_score ?? false,
		contributors: row.contributors ?? 0,
		minUsers: row.min_users ?? 10,
		attributes: {
			wifi: toConfirmed<Wifi>(attributes.wifi),
			outlets: toConfirmed<Outlets>(attributes.outlets),
			noise: toConfirmed<Noise>(attributes.noise),
			long_stays: toConfirmed<LongStays>(attributes.long_stays)
		},
		laptopRules: rules.map((raw) => ({
			rule: raw.rule as LaptopRule,
			confirmations: raw.confirmations,
			lastConfirmedOn: raw.last_confirmed_on
		}))
	};
}

/**
 * The place, or undefined when the city has no such place. In the browser, a result from the
 * last minute is reused (the preview fetches it, the page opened right after does not).
 */
export async function fetchPlaceDetail(
	supabase: Client,
	cityId: string,
	slug: string
): Promise<PlaceDetail | undefined> {
	const key = `${cityId}/${slug}`;
	const hit = browser ? cache.get(key) : undefined;
	if (hit && Date.now() - hit.at < CACHE_MS) return hit.detail;

	const { data, error } = await supabase
		.from('place_details')
		.select(COLUMNS)
		.eq('city_id', cityId)
		.eq('slug', slug)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return undefined;
	const detail = toPlaceDetail(data);
	if (browser) cache.set(key, { at: Date.now(), detail });
	return detail;
}

/** The place as a map pin. */
export function toFeature(place: PlaceDetail): PlaceFeature {
	return {
		type: 'Feature',
		geometry: { type: 'Point', coordinates: place.point },
		properties: { slug: place.slug, name: place.name, level: place.level }
	};
}
