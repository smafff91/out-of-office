/**
 * One place for the tap preview and the place page (supabase/migrations/20261017120000_place_details.sql).
 * Only aggregates: counts, prevailing values and days in the city's timezone.
 */
import type { LngLat, PlaceFeature, PlaceLevel } from '#lib/map/index.ts';
import type { PlacePhoto } from '#lib/places/photos.ts';
import { isPhotoPath } from '#lib/photos/urls.ts';
import { publicPhotoUrl } from './photos.ts';
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

export type ConfirmedRule = {
	rule: LaptopRule;
	confirmations: number;
	lastConfirmedOn: string;
	/** Time limit only: the most frequent answer, when given. */
	hours?: 1 | 2 | 3;
};

export type PlaceExtra = 'air_conditioning' | 'toilet' | 'large_tables' | 'minimum_spend';

/** A detail at least one active contribution mentions (not choosing one is not a "no"). */
export type ConfirmedExtra = { extra: PlaceExtra; confirmations: number; lastConfirmedOn: string };

/** A short note, dated by month only ("YYYY-MM"), without its author. */
export type PlaceNote = { note: string; month: string };

export type PlaceDetail = {
	id: string;
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
	extras: ConfirmedExtra[];
	/** Check-in thresholds, only to show the distance in the form (the database decides). */
	checkin: { radiusM: number; maxAccuracyM: number };
	/** The latest visible photos (3 at most, newest first), for the preview strip. */
	photoPaths: string[];
	/** Visible photos in the gallery (12 at most), for "+N". */
	photoCount: number;
	/** Public names, notes and the gallery: the place page only (fetchPlaceCommunity). */
	contributorNames?: string[];
	notes?: PlaceNote[];
	photos?: PlacePhoto[];
};

const COLUMNS =
	'id, slug, name, amenity, level, cert_origin, certified_on, neighborhood, district, address, lng, lat, opening_hours, timezone, internet_access_osm, osm_type, osm_id, may_have_closed, votes, yes_votes, score_pct, has_score, contributors, min_users, attributes, laptop_rules, extras, checkin_radius_m, checkin_max_accuracy_m, photo_paths, photo_count';

/** Contributions change slowly: a preview opened a minute ago is fresh enough for its page. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; detail: PlaceDetail }>();

type RawConfirmed = {
	value?: string;
	rule?: string;
	extra?: string;
	hours?: number;
	confirmations: number;
	last_confirmed_on: string;
};

const HOURS = new Set([1, 2, 3]);

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
	const extras = (row.extras ?? []) as RawConfirmed[];
	return {
		id: row.id ?? '',
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
			lastConfirmedOn: raw.last_confirmed_on,
			...(raw.hours && HOURS.has(raw.hours) && { hours: raw.hours as 1 | 2 | 3 })
		})),
		extras: extras.map((raw) => ({
			extra: raw.extra as PlaceExtra,
			confirmations: raw.confirmations,
			lastConfirmedOn: raw.last_confirmed_on
		})),
		checkin: {
			radiusM: row.checkin_radius_m ?? 100,
			maxAccuracyM: row.checkin_max_accuracy_m ?? 100
		},
		photoPaths: (row.photo_paths ?? []).filter(isPhotoPath),
		photoCount: row.photo_count ?? 0
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

/** Load dependency of the place page and its form (invalidate() after an update). */
export const PLACE_DEPENDENCY = 'app:place';

/** After an update: the next read of this place asks the database again. */
export function invalidatePlaceDetail(cityId: string, slug: string) {
	cache.delete(`${cityId}/${slug}`);
}

/** A photo of place_photos, with its two public addresses. */
export function toPlacePhoto(row: {
	path: string | null;
	width: number | null;
	height: number | null;
	credit: string | null;
}): PlacePhoto | undefined {
	if (!isPhotoPath(row.path)) return undefined;
	const url = publicPhotoUrl('large', row.path);
	const thumbUrl = publicPhotoUrl('thumb', row.path);
	if (!url || !thumbUrl) return undefined;
	return {
		url,
		thumbUrl,
		width: row.width ?? undefined,
		height: row.height ?? undefined,
		...(row.credit && { author: row.credit })
	};
}

/** Public names ("Shared by …"), notes and photos of a place, for its page. */
export async function fetchPlaceCommunity(
	supabase: Client,
	placeId: string
): Promise<{ contributorNames: string[]; notes: PlaceNote[]; photos: PlacePhoto[] }> {
	const [names, notes, photos] = await Promise.all([
		supabase.from('place_contributors').select('display_name').eq('place_id', placeId),
		supabase
			.from('place_notes')
			.select('note, created_month')
			.eq('place_id', placeId)
			.order('created_month', { ascending: false })
			.limit(20),
		// The 12 latest visible photos (the view keeps no more), newest first.
		supabase
			.from('place_photos')
			.select('path, width, height, credit')
			.eq('place_id', placeId)
			.order('sort_order')
	]);
	if (names.error) throw new Error(names.error.message);
	if (notes.error) throw new Error(notes.error.message);
	if (photos.error) throw new Error(photos.error.message);
	return {
		contributorNames: names.data.flatMap((row) => (row.display_name ? [row.display_name] : [])),
		notes: notes.data.flatMap((row) =>
			row.note && row.created_month ? [{ note: row.note, month: row.created_month }] : []
		),
		photos: photos.data.flatMap((row) => toPlacePhoto(row) ?? [])
	};
}

/** The place as a map pin. */
export function toFeature(place: PlaceDetail): PlaceFeature {
	return {
		type: 'Feature',
		geometry: { type: 'Point', coordinates: place.point },
		properties: { slug: place.slug, name: place.name, level: place.level }
	};
}
