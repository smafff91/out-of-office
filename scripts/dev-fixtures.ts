/**
 * Test data for the DEVELOPMENT project only: marks a few places near the city center as
 * certified or community and gives them anonymous test contributions (varied votes,
 * attributes and dates), so the map shows all three pin types and the list shows scores,
 * "2 of 2", Top rated and attribute pills.
 *
 *   npm run dev:fixtures -- --city barcelona            add them
 *   npm run dev:fixtures -- --city barcelona --remove   undo exactly what was added
 *
 * Contributions need the development-only grants: run `npm run dev:grants` first.
 * The touched places (with their previous values) and the ids of the contributions are saved
 * in .cache/dev-fixtures/<city>.json; no schema column marks test data.
 * Refuses to run unless PUBLIC_SUPABASE_URL belongs to DEV_PROJECT_REF (both in .env).
 */
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Database } from '#lib/supabase/database.types.ts';

const CERTIFIED = 6;
const COMMUNITY = 14;
const PAGE_SIZE = 1000;
const CACHE_DIR = path.join('.cache', 'dev-fixtures');

type Place = Database['public']['Tables']['places']['Row'];
type Contribution = Database['public']['Tables']['contributions']['Insert'];
type Saved = Pick<Place, 'id' | 'name' | 'level' | 'cert_origin' | 'certified_at'>;
/** Older runs saved only the places array. */
type SavedFile = { places: Saved[]; contributions: string[] } | Saved[];

const { values: args } = parseArgs({
	options: { city: { type: 'string' }, remove: { type: 'boolean', default: false } }
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

const citySlug = args.city ?? fail('Usage: npm run dev:fixtures -- --city <slug> [--remove]');
const url = requireEnv('PUBLIC_SUPABASE_URL');
const devRef = requireEnv('DEV_PROJECT_REF');
if (new URL(url).hostname !== `${devRef}.supabase.co`) {
	fail(`PUBLIC_SUPABASE_URL is not the development project (${devRef}): nothing changed.`);
}

const supabase = createClient<Database>(url, requireEnv('SUPABASE_SECRET_KEY'), {
	auth: { persistSession: false, autoRefreshToken: false }
});
const cacheFile = path.join(CACHE_DIR, `${citySlug}.json`);

async function readSaved(): Promise<{ places: Saved[]; contributions: string[] } | undefined> {
	try {
		const saved = JSON.parse(await readFile(cacheFile, 'utf8')) as SavedFile;
		return Array.isArray(saved) ? { places: saved, contributions: [] } : saved;
	} catch {
		return undefined;
	}
}

async function remove() {
	const saved = (await readSaved()) ?? fail(`No fixtures to remove (${cacheFile} not found).`);
	for (let i = 0; i < saved.contributions.length; i += 100) {
		const ids = saved.contributions.slice(i, i + 100);
		const { error } = await supabase.from('contributions').delete().in('id', ids);
		if (error)
			fail(`Could not delete test contributions (run npm run dev:grants?): ${error.message}`);
	}
	for (const place of saved.places) {
		const { error } = await supabase
			.from('places')
			.update({
				level: place.level,
				cert_origin: place.cert_origin,
				certified_at: place.certified_at
			})
			.eq('id', place.id);
		if (error) fail(`Could not restore ${place.name}: ${error.message}`);
	}
	await rm(cacheFile);
	console.log(
		`✔ Deleted ${saved.contributions.length} test contributions, restored ${saved.places.length} places in ${citySlug}.`
	);
}

async function add() {
	if (await readSaved()) fail(`Fixtures already applied: run with --remove first.`);

	const { data: city, error: cityError } = await supabase
		.from('cities')
		.select('id')
		.eq('slug', citySlug)
		.maybeSingle();
	if (cityError) fail(cityError.message);
	if (!city) fail(`Unknown city "${citySlug}".`);

	const places: (Saved & { lat: number; lng: number })[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from('places')
			.select('id, name, lat, lng, level, cert_origin, certified_at')
			.eq('city_id', city.id)
			.eq('review_status', 'approved')
			.is('osm_missing_since', null)
			.order('id')
			.range(from, from + PAGE_SIZE - 1);
		if (error) fail(error.message);
		for (const { lat, lng, ...place } of data) {
			if (lat !== null && lng !== null) places.push({ ...place, lat, lng });
		}
		if (data.length < PAGE_SIZE) break;
	}
	if (places.some((place) => place.level !== 'osm_only')) {
		fail('This city already has community or certified places: nothing changed.');
	}

	// Nearest places to the middle of the city's places (no PostGIS over the API).
	const midLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
	const midLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
	const distance = (p: { lat: number; lng: number }) =>
		Math.hypot(p.lat - midLat, (p.lng - midLng) * Math.cos((midLat * Math.PI) / 180));
	const chosen = places
		.toSorted((a, b) => distance(a) - distance(b))
		.slice(0, CERTIFIED + COMMUNITY);

	// Save before writing, so --remove can always undo a partial run.
	await mkdir(CACHE_DIR, { recursive: true });
	const saved: Saved[] = chosen.map(({ id, name, level, cert_origin, certified_at }) => ({
		id,
		name,
		level,
		cert_origin,
		certified_at
	}));
	const contributionIds: string[] = [];
	const save = () =>
		writeFile(
			cacheFile,
			`${JSON.stringify({ places: saved, contributions: contributionIds }, null, '\t')}\n`
		);
	await save();

	const now = new Date().toISOString();
	for (const [index, place] of chosen.entries()) {
		// Every third place is certified, so both kinds are mixed on the map.
		const certified = index % 3 === 0 && index / 3 < CERTIFIED;
		const { error } = await supabase
			.from('places')
			.update(
				certified
					? { level: 'certified', cert_origin: 'manual', certified_at: now }
					: { level: 'community' }
			)
			.eq('id', place.id);
		if (error) fail(`Could not update ${place.name}: ${error.message}`);

		const rows = testContributions(place.id, city.id, certified, index);
		const { data, error: insertError } = await supabase
			.from('contributions')
			.insert(rows)
			.select('id');
		if (insertError) {
			fail(
				`Could not add test contributions (run npm run dev:grants first?): ${insertError.message}`
			);
		}
		contributionIds.push(...data.map((row) => row.id));
		await save();
		const yes = rows.filter((row) => row.would_work_again).length;
		console.log(
			`  ${certified ? 'certified' : 'community'}  ${place.name}  (${yes}/${rows.length} yes)`
		);
	}
	console.log(
		`✔ Fixtures added in ${citySlug}. Undo: npm run dev:fixtures -- --city ${citySlug} --remove`
	);
}

/** Small seeded generator: the same run gives the same test data. */
function random(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Anonymous votes for one place: certified places get 6-14 mostly positive votes; community
 * places alternate between a few votes ("2 of 2") and 5+ votes (a percentage), so every
 * Top rated section has rows. Dates spread over the last 60 days.
 */
function testContributions(
	placeId: string,
	cityId: string,
	certified: boolean,
	index: number
): Contribution[] {
	const next = random(index + 1);
	const pick = <T>(values: readonly T[]) => values[Math.floor(next() * values.length)];
	const count = certified
		? 6 + Math.floor(next() * 9)
		: index % 2
			? 1 + Math.floor(next() * 4)
			: 5 + Math.floor(next() * 4);
	const yesRate = certified ? 0.85 : 0.4 + next() * 0.5;
	return Array.from({ length: count }, () => ({
		place_id: placeId,
		// Set again by the database from the place (contributions_c_set_city).
		city_id: cityId,
		anon_key: crypto.randomUUID(),
		would_work_again: next() < yesRate,
		wifi: pick(
			certified ? (['fast', 'fast', 'slow'] as const) : (['fast', 'slow', 'none'] as const)
		),
		outlets: pick(
			certified ? (['plenty', 'a_few'] as const) : (['plenty', 'a_few', 'none'] as const)
		),
		noise: pick(['quiet', 'quiet', 'noisy'] as const),
		long_stays: pick(['welcome', 'not_really'] as const),
		laptop_rules:
			next() < 0.3
				? [pick(['no_laptops_lunch', 'no_laptops_weekends', 'time_limit'] as const)]
				: null,
		checked_in: next() < 0.6,
		created_at: new Date(Date.now() - next() * 60 * 86_400_000).toISOString()
	}));
}

await (args.remove ? remove() : add());
