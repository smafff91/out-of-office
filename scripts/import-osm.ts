/**
 * Imports the cafes and bars of one city from OpenStreetMap (Overpass API) into `places`,
 * together with the city boundary, districts and neighborhoods.
 *
 *   npm run import:osm -- --city barcelona [--dry-run] [--from-cache] [--force]
 *
 * --dry-run     compute everything and print the summary, write nothing
 * --from-cache  reuse the latest raw response in .cache/osm/ instead of calling Overpass
 * --force       go on even if OSM returns far fewer places than the database has
 *
 * Needs SUPABASE_SECRET_KEY and OSM_CONTACT in .env. The secret key is for scripts only:
 * nothing in src/ may read it.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { APP_NAME } from '#lib/config.ts';
import type { Database, Json, TablesInsert } from '#lib/supabase/database.types.ts';

/** Tried in order, one attempt each. Override with OVERPASS_URLS (comma separated). */
const DEFAULT_OVERPASS_URLS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];
const OVERPASS_TIMEOUT_S = 180;
const NETWORK_TIMEOUT_MS = 200_000;
const PAUSE_BETWEEN_SERVERS_MS = 5_000;
const CACHE_DIR = path.join('.cache', 'osm');
const BATCH_SIZE = 500;
const ID_BATCH_SIZE = 100;
const PAGE_SIZE = 1000;
/** Stop if OSM returns fewer than this share of the places already in the database. */
const MIN_PRESENT_RATIO = 0.7;
const SAMPLE_SIZE = 25;
const AMENITIES = ['cafe', 'bar'] as const;
const WIFI_VALUES = new Set(['wlan', 'yes', 'wifi']);

type Amenity = (typeof AMENITIES)[number];
type OsmPlaceType = 'node' | 'way';
type LatLon = { lat: number; lon: number };

type OverpassElement = {
	type: 'node' | 'way' | 'relation';
	id: number;
	lat?: number;
	lon?: number;
	center?: LatLon;
	tags?: Record<string, string>;
	members?: { type: string; ref: number; role: string; geometry?: (LatLon | null)[] }[];
};

type OverpassResponse = {
	osm3s?: { timestamp_osm_base?: string };
	remark?: string;
	elements: OverpassElement[];
};

type CacheFile = { fetched_at: string; server: string; query: string; response: OverpassResponse };

type PlaceRow = Pick<
	Database['public']['Tables']['places']['Row'],
	| 'id'
	| 'osm_type'
	| 'osm_id'
	| 'slug'
	| 'name'
	| 'lat'
	| 'lng'
	| 'address'
	| 'opening_hours'
	| 'phone'
	| 'website'
	| 'instagram'
	| 'internet_access_osm'
	| 'osm_missing_since'
	| 'amenity'
>;

type OsmPlace = {
	osm_type: OsmPlaceType;
	osm_id: number;
	amenity: Amenity;
	name: string;
	lat: number;
	lng: number;
	street: string | null;
	address: string | null;
	opening_hours: string | null;
	phone: string | null;
	website: string | null;
	instagram: string | null;
	internet_access_osm: string | null;
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
	options: {
		city: { type: 'string' },
		'dry-run': { type: 'boolean', default: false },
		'from-cache': { type: 'boolean', default: false },
		force: { type: 'boolean', default: false }
	}
});

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) fail(`Missing ${name} in .env (see .env.example).`);
	return value;
}

const citySlug = args.city ?? fail('Usage: npm run import:osm -- --city <slug> [--dry-run]');
const dryRun = args['dry-run'];
const supabase = createClient<Database>(
	requireEnv('PUBLIC_SUPABASE_URL'),
	requireEnv('SUPABASE_SECRET_KEY'),
	{ auth: { persistSession: false, autoRefreshToken: false } }
);

// ---------------------------------------------------------------------------
// Overpass
// ---------------------------------------------------------------------------

function buildQuery(relationId: number, adminLevels: number[]): string {
	return [
		`[out:json][timeout:${OVERPASS_TIMEOUT_S}];`,
		`rel(${relationId});`,
		'out geom;',
		`area(id:${3_600_000_000 + relationId})->.city;`,
		`rel(area.city)["boundary"="administrative"]["admin_level"~"^(${adminLevels.join('|')})$"];`,
		'out geom;',
		`nw(area.city)["amenity"~"^(${AMENITIES.join('|')})$"];`,
		'out center tags;'
	].join('\n');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOverpass(query: string): Promise<CacheFile> {
	const servers = (process.env.OVERPASS_URLS?.split(',') ?? DEFAULT_OVERPASS_URLS)
		.map((url) => url.trim())
		.filter(Boolean);
	const userAgent = `${APP_NAME.replace(/\s+/g, '')}-osm-import/0.1 (${requireEnv('OSM_CONTACT')})`;

	for (const [index, server] of servers.entries()) {
		if (index > 0) {
			console.log(`  waiting ${PAUSE_BETWEEN_SERVERS_MS / 1000}s before the next server…`);
			await sleep(PAUSE_BETWEEN_SERVERS_MS);
		}
		console.log(`→ Overpass: ${server}`);
		let response: Response;
		try {
			response = await fetch(server, {
				method: 'POST',
				headers: {
					'User-Agent': userAgent,
					Accept: 'application/json',
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({ data: query }),
				signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS)
			});
		} catch (error) {
			console.warn(`  failed: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}
		// A bad query fails the same way everywhere: no point in trying other servers.
		if (response.status === 400) fail(`Overpass rejected the query:\n${await response.text()}`);
		if (!response.ok) {
			console.warn(`  failed: HTTP ${response.status}`);
			continue;
		}
		let body: OverpassResponse;
		try {
			body = JSON.parse(await response.text()) as OverpassResponse;
		} catch {
			console.warn('  failed: the answer is not JSON (server busy?)');
			continue;
		}
		if (body.remark && /error/i.test(body.remark)) {
			console.warn(`  failed: ${body.remark}`);
			continue;
		}
		return { fetched_at: new Date().toISOString(), server, query, response: body };
	}
	fail('All Overpass servers failed. Try again later.');
}

async function saveCache(data: CacheFile): Promise<string> {
	await mkdir(CACHE_DIR, { recursive: true });
	const file = path.join(CACHE_DIR, `${citySlug}-${data.fetched_at.replace(/[:.]/g, '-')}.json`);
	await writeFile(file, JSON.stringify(data));
	return file;
}

async function loadLatestCache(): Promise<{ file: string; data: CacheFile }> {
	const files = await readdir(CACHE_DIR).catch(() => [] as string[]);
	const latest = files
		.filter((name) => name.startsWith(`${citySlug}-`) && name.endsWith('.json'))
		.sort()
		.at(-1);
	if (!latest)
		fail(`No cached response for "${citySlug}" in ${CACHE_DIR}. Run without --from-cache.`);
	const file = path.join(CACHE_DIR, latest);
	return { file, data: JSON.parse(await readFile(file, 'utf8')) as CacheFile };
}

// ---------------------------------------------------------------------------
// OSM parsing
// ---------------------------------------------------------------------------

/** GeoJSON MultiLineString of the outer/inner ways of a boundary relation. */
function boundaryLines(relation: OverpassElement): Json {
	const coordinates = (relation.members ?? [])
		.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === 'inner') && m.geometry)
		.map((m) =>
			(m.geometry ?? []).filter((p): p is LatLon => p !== null).map((p) => [p.lon, p.lat])
		)
		.filter((line) => line.length >= 2);
	return { type: 'MultiLineString', coordinates };
}

function tag(tags: Record<string, string>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = tags[key]?.trim();
		if (value) return value;
	}
	return null;
}

function instagramHandle(value: string | null): string | null {
	if (!value) return null;
	const match = value
		.trim()
		.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/)?@?([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i);
	return match ? match[1] : null;
}

function toOsmPlace(element: OverpassElement): OsmPlace | null {
	const tags = element.tags ?? {};
	const name = tag(tags, 'name');
	const position = element.type === 'node' ? element : element.center;
	if (!name || position?.lat === undefined || position.lon === undefined) return null;
	const street = tag(tags, 'addr:street');
	const number = tag(tags, 'addr:housenumber');
	return {
		osm_type: element.type as OsmPlaceType,
		osm_id: element.id,
		amenity: tags.amenity as Amenity,
		name,
		lat: position.lat,
		lng: position.lon,
		street,
		address: street ? (number ? `${street}, ${number}` : street) : null,
		opening_hours: tag(tags, 'opening_hours'),
		phone: tag(tags, 'phone', 'contact:phone'),
		website: tag(tags, 'website', 'contact:website'),
		instagram: instagramHandle(tag(tags, 'contact:instagram', 'instagram')),
		internet_access_osm: tag(tags, 'internet_access')
	};
}

const hasWifi = (value: string | null) =>
	!!value && value.split(';').some((v) => WIFI_VALUES.has(v.trim().toLowerCase()));

// ---------------------------------------------------------------------------
// Slugs: generated once for new places, never changed afterwards
// ---------------------------------------------------------------------------

const SLUG_MAX = 60;

function slugify(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/['’`·]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, SLUG_MAX)
		.replace(/^-+|-+$/g, '');
}

/** Name, then name + neighborhood, then name + street, then name + number. */
function uniqueSlug(place: OsmPlace, neighborhood: string | null, used: Set<string>): string {
	const base = slugify(place.name) || `place-${place.osm_id}`;
	const candidates = [base];
	if (neighborhood) candidates.push(slugify(`${base} ${neighborhood}`));
	if (place.street) candidates.push(slugify(`${base} ${place.street}`));
	for (const candidate of candidates) {
		if (candidate && !used.has(candidate)) return candidate;
	}
	for (let n = 2; ; n++) {
		const candidate = `${base}-${n}`;
		if (!used.has(candidate)) return candidate;
	}
}

// ---------------------------------------------------------------------------
// Neighborhood lookup for new slugs (the stored neighborhood_id is assigned in SQL)
// ---------------------------------------------------------------------------

type Ring = number[][];
type NeighborhoodShape = { name: string; polygons: Ring[][] };

function inRing(lng: number, lat: number, ring: Ring): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function neighborhoodAt(lng: number, lat: number, shapes: NeighborhoodShape[]): string | null {
	const shape = shapes.find((s) =>
		s.polygons.some(
			([outer, ...holes]) =>
				inRing(lng, lat, outer) && !holes.some((hole) => inRing(lng, lat, hole))
		)
	);
	return shape?.name ?? null;
}

async function loadNeighborhoodShapes(cityId: string): Promise<NeighborhoodShape[]> {
	const { data, error } = await supabase
		.from('neighborhoods')
		.select('name, geom')
		.eq('city_id', cityId)
		.eq('kind', 'neighborhood');
	if (error) fail(`Could not read neighborhoods: ${error.message}`);
	// PostgREST returns geometry columns as GeoJSON. Slugs use the official name, which is stable.
	return data.map((row) => ({
		name: row.name,
		polygons: (row.geom as { coordinates: Ring[][] }).coordinates
	}));
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function loadCityPlaces(cityId: string): Promise<PlaceRow[]> {
	const rows: PlaceRow[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from('places')
			.select(
				'id, osm_type, osm_id, slug, name, lat, lng, address, opening_hours, phone, website, instagram, internet_access_osm, osm_missing_since, amenity'
			)
			.eq('city_id', cityId)
			.order('id')
			.range(from, from + PAGE_SIZE - 1);
		if (error) fail(`Could not read places: ${error.message}`);
		rows.push(...data);
		if (data.length < PAGE_SIZE) return rows;
	}
}

const chunks = <T>(items: T[], size: number) =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
		items.slice(i * size, (i + 1) * size)
	);

const osmKey = (type: string | null, id: number | null) => `${type}/${id}`;
const osmUrl = (type: string | null, id: number | null) =>
	`https://www.openstreetmap.org/${type}/${id}`;

function osmDataChanged(row: PlaceRow, place: OsmPlace): boolean {
	return (
		row.name !== place.name ||
		Math.abs((row.lat ?? 0) - place.lat) > 1e-9 ||
		Math.abs((row.lng ?? 0) - place.lng) > 1e-9 ||
		row.address !== place.address ||
		row.opening_hours !== place.opening_hours ||
		row.phone !== place.phone ||
		row.website !== place.website ||
		row.instagram !== place.instagram ||
		row.internet_access_osm !== place.internet_access_osm ||
		row.amenity !== place.amenity
	);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const formatDate = (value: string | null | undefined) =>
	value ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never';

async function main() {
	const { data: city, error: cityError } = await supabase
		.from('cities')
		.select(
			'id, slug, name, osm_relation_id, district_admin_level, neighborhood_admin_level, last_osm_import_at, osm_data_at'
		)
		.eq('slug', citySlug)
		.maybeSingle();
	if (cityError) fail(`Could not read cities: ${cityError.message}`);
	if (!city) fail(`City "${citySlug}" not found in the cities table.`);
	if (!city.osm_relation_id) fail(`City "${citySlug}" has no osm_relation_id.`);
	const adminLevels = [city.district_admin_level, city.neighborhood_admin_level].filter(
		(level): level is number => level !== null
	);

	console.log(`${dryRun ? 'DRY RUN — nothing will be written.\n' : ''}City: ${city.name}`);

	// 1. Raw OSM data: from cache or from Overpass (saved before anything else).
	let source: CacheFile;
	let cacheFile: string;
	if (args['from-cache']) {
		({ file: cacheFile, data: source } = await loadLatestCache());
	} else {
		source = await fetchOverpass(buildQuery(city.osm_relation_id, adminLevels));
		cacheFile = await saveCache(source);
	}
	const osmBase = source.response.osm3s?.timestamp_osm_base ?? null;

	// 2. Parse.
	const elements = source.response.elements;
	const cityRelation = elements.find((e) => e.type === 'relation' && e.id === city.osm_relation_id);
	if (!cityRelation) fail('The response does not contain the city boundary.');
	const areaRelations = elements.filter(
		(e) =>
			e.type === 'relation' &&
			e.id !== city.osm_relation_id &&
			e.tags?.boundary === 'administrative' &&
			adminLevels.includes(Number(e.tags.admin_level))
	);
	const amenityElements = elements.filter(
		(e) => (e.type === 'node' || e.type === 'way') && AMENITIES.includes(e.tags?.amenity as Amenity)
	);
	const osmPlaces: OsmPlace[] = [];
	let skippedNoName = 0;
	for (const element of amenityElements) {
		const place = toOsmPlace(element);
		if (place) osmPlaces.push(place);
		else skippedNoName++;
	}

	// 3. Compare with the database; stop early if the download looks incomplete.
	const cityPlaces = await loadCityPlaces(city.id);
	const existing = new Map(
		cityPlaces.filter((p) => p.osm_id !== null).map((p) => [osmKey(p.osm_type, p.osm_id), p])
	);
	const usedSlugs = new Set(cityPlaces.map((p) => p.slug));
	const presentKeys = new Set(osmPlaces.map((p) => osmKey(p.osm_type, p.osm_id)));

	const activeInDb = [...existing.values()].filter((p) => !p.osm_missing_since).length;
	if (activeInDb > 0 && osmPlaces.length < activeInDb * MIN_PRESENT_RATIO && !args.force) {
		fail(
			`OSM returned ${osmPlaces.length} places but the database has ${activeInDb}. ` +
				'The download may be incomplete: nothing was written. Use --force if this is expected.'
		);
	}

	// 4. Boundaries first: new slugs use the neighborhood name.
	let boundaries: Record<string, unknown> | null = null;
	if (!dryRun) {
		const { data: boundaryResult, error: boundaryError } = await supabase.rpc(
			'import_osm_boundaries',
			{
				p_city_id: city.id,
				p_city_lines: boundaryLines(cityRelation),
				p_areas: areaRelations.map((r) => ({
					osm_relation_id: r.id,
					admin_level: Number(r.tags?.admin_level),
					name: r.tags?.name ?? null,
					lines: boundaryLines(r)
				}))
			}
		);
		if (boundaryError) fail(`Boundary import failed: ${boundaryError.message}`);
		boundaries = boundaryResult as Record<string, unknown>;
	}
	const shapes = await loadNeighborhoodShapes(city.id);
	if (!dryRun && shapes.length === 0 && city.neighborhood_admin_level !== null) {
		fail('No neighborhoods were saved, so new slugs cannot use them. Places were not written.');
	}

	const upserts: TablesInsert<'places'>[] = [];
	const slugByKey = new Map<string, string>();
	let created = 0;
	let updated = 0;
	let unchanged = 0;
	let reappeared = 0;

	const toRow = (place: OsmPlace, slug: string): TablesInsert<'places'> => ({
		city_id: city.id,
		osm_type: place.osm_type,
		osm_id: place.osm_id,
		slug,
		name: place.name,
		geom: `SRID=4326;POINT(${place.lng} ${place.lat})`,
		address: place.address,
		opening_hours: place.opening_hours,
		phone: place.phone,
		website: place.website,
		instagram: place.instagram,
		internet_access_osm: place.internet_access_osm,
		amenity: place.amenity,
		osm_missing_since: null
	});

	// Sorted by OSM id so new slugs come out the same on every run.
	const sorted = [...osmPlaces].sort(
		(a, b) => a.osm_type.localeCompare(b.osm_type) || a.osm_id - b.osm_id
	);
	for (const place of sorted) {
		const key = osmKey(place.osm_type, place.osm_id);
		const row = existing.get(key);
		if (!row) {
			const slug = uniqueSlug(place, neighborhoodAt(place.lng, place.lat, shapes), usedSlugs);
			usedSlugs.add(slug);
			slugByKey.set(key, slug);
			upserts.push(toRow(place, slug));
			created++;
			continue;
		}
		slugByKey.set(key, row.slug);
		const changed = osmDataChanged(row, place);
		if (row.osm_missing_since) reappeared++;
		else if (changed) updated++;
		else unchanged++;
		if (changed || row.osm_missing_since) upserts.push(toRow(place, row.slug));
	}

	const notInOsm = [...existing.values()].filter(
		(p) => !presentKeys.has(osmKey(p.osm_type, p.osm_id))
	);
	const newlyMissing = notInOsm.filter((p) => !p.osm_missing_since);
	const stillMissing = notInOsm.length - newlyMissing.length;

	// 5. Write places.
	let neighborhoodStats: Record<string, unknown> | null = null;
	if (!dryRun) {
		for (const [index, batch] of chunks(upserts, BATCH_SIZE).entries()) {
			const { error } = await supabase
				.from('places')
				.upsert(batch, { onConflict: 'osm_type,osm_id' });
			if (error) fail(`Writing places failed at batch ${index + 1}: ${error.message}`);
		}

		const now = new Date().toISOString();
		for (const batch of chunks(
			newlyMissing.map((p) => p.id),
			ID_BATCH_SIZE
		)) {
			const { error } = await supabase
				.from('places')
				.update({ osm_missing_since: now })
				.in('id', batch);
			if (error) fail(`Marking missing places failed: ${error.message}`);
		}

		const { data: assignResult, error: assignError } = await supabase.rpc(
			'assign_place_neighborhoods',
			{ p_city_id: city.id }
		);
		if (assignError) fail(`Neighborhood assignment failed: ${assignError.message}`);
		neighborhoodStats = assignResult as Record<string, unknown>;

		const { error: cityUpdateError } = await supabase
			.from('cities')
			.update({ last_osm_import_at: now, osm_data_at: osmBase })
			.eq('id', city.id);
		if (cityUpdateError) fail(`Updating the city failed: ${cityUpdateError.message}`);
	}

	// 6. Summary.
	const count = (predicate: (p: OsmPlace) => boolean) => osmPlaces.filter(predicate).length;
	const lines: [string, string | number][] = [
		['OSM data as of', formatDate(osmBase)],
		['Source', `${args['from-cache'] ? 'cache' : 'Overpass'} (${source.server})`],
		['Raw response', cacheFile],
		['Previous import', formatDate(city.last_osm_import_at)],
		['', ''],
		['Cafes', count((p) => p.amenity === 'cafe')],
		['Bars', count((p) => p.amenity === 'bar')],
		['Skipped (no name)', skippedNoName],
		['', ''],
		['New', created],
		['Updated', updated],
		['Unchanged', unchanged],
		['Back in OSM', reappeared],
		['Gone from OSM (now)', newlyMissing.length],
		['Gone from OSM (before)', stillMissing],
		['', ''],
		['With Wi-Fi tag', count((p) => hasWifi(p.internet_access_osm))],
		['With opening hours', count((p) => p.opening_hours !== null)],
		[
			'With neighborhood',
			neighborhoodStats
				? `${neighborhoodStats.with_neighborhood} (without: ${neighborhoodStats.without_neighborhood})`
				: 'computed on write'
		],
		[
			'Districts / neighborhoods',
			boundaries
				? `${boundaries.districts} / ${boundaries.neighborhoods} (outside city: ${boundaries.outside_city})`
				: `${areaRelations.length} boundaries in the response; filtered on write`
		]
	];
	console.log(`\n${dryRun ? 'Would do' : 'Done'} — ${city.name}`);
	if (dryRun && shapes.length === 0) {
		console.log('  (no neighborhoods in the database yet: dry-run slugs fall back to the street)');
	}
	for (const [label, value] of lines) console.log(label ? `  ${label.padEnd(26)} ${value}` : '');
	const invalid = (boundaries?.invalid as unknown[] | undefined) ?? [];
	if (invalid.length)
		console.warn(`\n  ⚠ Boundaries that could not be built: ${JSON.stringify(invalid)}`);

	// 7. Random sample for a manual check.
	const sample = [...osmPlaces];
	for (let i = sample.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[sample[i], sample[j]] = [sample[j], sample[i]];
	}
	const picked = sample.slice(0, SAMPLE_SIZE);
	const neighborhoodByKey = new Map<string, string>();
	if (!dryRun && picked.length) {
		const { data, error } = await supabase
			.from('places')
			.select('osm_type, osm_id, neighborhood:neighborhoods(name, short_name)')
			.eq('city_id', city.id)
			.in(
				'slug',
				picked.map((p) => slugByKey.get(osmKey(p.osm_type, p.osm_id)) ?? '')
			);
		if (error) fail(`Could not read the sample: ${error.message}`);
		for (const row of data) {
			const n = row.neighborhood;
			if (n) neighborhoodByKey.set(osmKey(row.osm_type, row.osm_id), n.short_name ?? n.name);
		}
	}
	console.log(`\nRandom sample (${picked.length}):`);
	for (const place of picked) {
		const key = osmKey(place.osm_type, place.osm_id);
		console.log(
			`  ${place.amenity.padEnd(4)}  ${place.name} · ${neighborhoodByKey.get(key) ?? '—'} · /${citySlug}/${slugByKey.get(key)}\n` +
				`        ${osmUrl(place.osm_type, place.osm_id)}`
		);
	}
}

await main();
