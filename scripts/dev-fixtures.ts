/**
 * Test data for the DEVELOPMENT project only: gives a few places near the city center
 * anonymous test contributions (varied votes, attributes and dates), so the map shows all three
 * pin types and the list shows scores, "2 of 2", Top rated and attribute pills. Certification
 * goes through the real database functions, never by writing the level:
 * - 6 places "Picked by our team" (pick_place, then a few votes);
 * - 1 place that reaches the automatic certification ("Confirmed by N users");
 * - 1 picked place whose new votes make it lose the badge ("Certification removed in …").
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

const PICKED = 6;
const COMMUNITY = 14;
const FIXTURE_NOTE = 'Development fixtures (npm run dev:fixtures)';
const PAGE_SIZE = 1000;
const CACHE_DIR = path.join('.cache', 'dev-fixtures');

type Place = Database['public']['Tables']['places']['Row'];
type Contribution = Database['public']['Tables']['contributions']['Insert'];
type Saved = Pick<
	Place,
	| 'id'
	| 'name'
	| 'level'
	| 'cert_origin'
	| 'certified_at'
	| 'revoked_at'
	| 'revoked_notice'
	| 'auto_cert_blocked'
>;
type Kind = 'picked' | 'confirmed' | 'revoked' | 'community';
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
	// The certification history of these places (development grants, like the contributions).
	const ids = saved.places.map((place) => place.id);
	for (let i = 0; i < ids.length; i += 100) {
		const { error } = await supabase
			.from('place_level_changes')
			.delete()
			.in('place_id', ids.slice(i, i + 100));
		if (error) fail(`Could not delete level changes (run npm run dev:grants?): ${error.message}`);
	}
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
				certified_at: place.certified_at,
				// Older runs did not save these: they were always empty before feature 8.
				revoked_at: place.revoked_at ?? null,
				revoked_notice: place.revoked_notice ?? false,
				auto_cert_blocked: place.auto_cert_blocked ?? false
			})
			.eq('id', place.id);
		if (error) fail(`Could not restore ${place.name}: ${error.message}`);
	}
	await rm(cacheFile);
	// Places that also got real contributions go back to their level (real functions).
	const { data: city } = await supabase.from('cities').select('id').eq('slug', citySlug).single();
	if (city) {
		const { error } = await supabase.rpc('recompute_city_certification', { p_city_id: city.id });
		if (error) fail(`Could not recompute the city: ${error.message}`);
	}
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

	const places: (Saved & { lat: number; lng: number; opening_hours: string | null })[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from('places')
			.select(
				'id, name, lat, lng, opening_hours, level, cert_origin, certified_at, revoked_at, revoked_notice, auto_cert_blocked'
			)
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
	// Only untouched places: never one with real contributions (your own tests from the form).
	const touched = new Set<string>();
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from('contributions')
			.select('place_id')
			.eq('city_id', city.id)
			.order('id')
			.range(from, from + PAGE_SIZE - 1);
		if (error)
			fail(`Could not read contributions (run npm run dev:grants first?): ${error.message}`);
		for (const row of data) touched.add(row.place_id);
		if (data.length < PAGE_SIZE) break;
	}
	const free = places.filter((place) => place.level === 'osm_only' && !touched.has(place.id));

	// Nearest places to the middle of the city's places (no PostGIS over the API).
	const midLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
	const midLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
	const distance = (p: { lat: number; lng: number }) =>
		Math.hypot(p.lat - midLat, (p.lng - midLng) * Math.cos((midLat * Math.PI) / 180));
	const sorted = free.toSorted((a, b) => distance(a) - distance(b));
	const nearby = sorted.slice(0, PICKED + COMMUNITY);
	// The automatic certification and the removal on places without OSM hours, so the daytime
	// condition never gets in the way.
	const withoutHours = sorted
		.slice(PICKED + COMMUNITY)
		.filter((place) => !place.opening_hours)
		.slice(0, 2);
	if (withoutHours.length < 2) fail('Not enough places without opening hours near the center.');
	const chosen: { place: (typeof places)[number]; kind: Kind }[] = [
		// Every third place is picked, so both kinds are mixed on the map.
		...nearby.map((place, index) => ({
			place,
			kind: (index % 3 === 0 && index / 3 < PICKED ? 'picked' : 'community') as Kind
		})),
		{ place: withoutHours[0], kind: 'confirmed' },
		{ place: withoutHours[1], kind: 'revoked' }
	];

	// Save before writing, so --remove can always undo a partial run.
	await mkdir(CACHE_DIR, { recursive: true });
	const saved: Saved[] = chosen.map(({ place }) => ({
		id: place.id,
		name: place.name,
		level: place.level,
		cert_origin: place.cert_origin,
		certified_at: place.certified_at,
		revoked_at: place.revoked_at,
		revoked_notice: place.revoked_notice,
		auto_cert_blocked: place.auto_cert_blocked
	}));
	const contributionIds: string[] = [];
	const save = () =>
		writeFile(
			cacheFile,
			`${JSON.stringify({ places: saved, contributions: contributionIds }, null, '\t')}\n`
		);
	await save();

	for (const [index, { place, kind }] of chosen.entries()) {
		// Picked first (a pick is refused when the votes would remove the badge at once).
		if (kind === 'picked' || kind === 'revoked') {
			const { error } = await supabase.rpc('pick_place', {
				p_place_id: place.id,
				p_note: FIXTURE_NOTE
			});
			if (error) fail(`Could not pick ${place.name}: ${error.message}`);
		}

		const rows = testContributions(place.id, city.id, kind, index);
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
	}

	// osm_only → community, the automatic certification and the removal: the real functions.
	const { data: recomputed, error: recomputeError } = await supabase.rpc(
		'recompute_city_certification',
		{ p_city_id: city.id }
	);
	if (recomputeError) fail(`Could not recompute the city: ${recomputeError.message}`);

	const { data: after, error: afterError } = await supabase
		.from('places')
		.select('id, name, level, cert_origin, revoked_at')
		.in(
			'id',
			chosen.map(({ place }) => place.id)
		);
	if (afterError) fail(afterError.message);
	const byId = new Map(after.map((row) => [row.id, row]));
	for (const [index, { place, kind }] of chosen.entries()) {
		const row = byId.get(place.id);
		const state =
			row?.level === 'certified' ? `certified (${row.cert_origin})` : (row?.level ?? '?');
		console.log(
			`  ${kind.padEnd(9)} → ${state.padEnd(21)}  ${place.name}  (${contributionCount(kind, index)} votes)`
		);
	}
	type After = NonNullable<typeof after>[number];
	const expect = (kind: Kind, ok: (row: After | undefined) => boolean) => {
		const entry = chosen.find((c) => c.kind === kind);
		if (entry && !ok(byId.get(entry.place.id))) {
			fail(
				`${entry.place.name} did not end up ${kind}: check npm run certify -- --list ${citySlug}`
			);
		}
	};
	expect('confirmed', (row) => row?.level === 'certified' && row.cert_origin === 'confirmed');
	expect('revoked', (row) => row?.level === 'community' && row.revoked_at !== null);
	console.log(
		`✔ Fixtures added in ${citySlug} (${(recomputed as { changes: number }).changes} level changes). ` +
			`Undo: npm run dev:fixtures -- --city ${citySlug} --remove`
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
 * How many votes: picked places 6-9 (below the 10 users of the automatic certification, so they
 * stay picked); community places alternate between a few ("2 of 2") and 5-8 (a percentage), so
 * every Top rated section has rows; 12 for the automatic certification; 10 for the removal.
 */
function contributionCount(kind: Kind, index: number): number {
	const next = random(index + 1);
	if (kind === 'picked') return 6 + Math.floor(next() * 4);
	if (kind === 'confirmed') return 12;
	if (kind === 'revoked') return 10;
	return index % 2 ? 1 + Math.floor(next() * 4) : 5 + Math.floor(next() * 4);
}

/**
 * Anonymous votes for one place, dates over the last 60 days.
 * - picked: mostly positive, Wi-Fi and long stays fine (no removal at the next recompute);
 * - confirmed: 11 of 12 yes, 7 checked in, the first 20 days ago, Wi-Fi and long stays fine;
 * - revoked: 4 of 10 yes in the last weeks (score below 60%);
 * - community: anything.
 */
function testContributions(
	placeId: string,
	cityId: string,
	kind: Kind,
	index: number
): Contribution[] {
	const next = random(index + 101);
	const pick = <T>(values: readonly T[]) => values[Math.floor(next() * values.length)];
	const count = contributionCount(kind, index);
	const good = kind !== 'community';
	return Array.from({ length: count }, (_, i) => ({
		place_id: placeId,
		// Set again by the database from the place (contributions_c_set_city).
		city_id: cityId,
		anon_key: crypto.randomUUID(),
		would_work_again:
			kind === 'confirmed'
				? i !== 3
				: kind === 'revoked'
					? i < 4
					: next() < (kind === 'picked' ? 0.85 : 0.4 + next() * 0.5),
		wifi: pick(good ? (['fast', 'fast', 'slow'] as const) : (['fast', 'slow', 'none'] as const)),
		outlets: pick(good ? (['plenty', 'a_few'] as const) : (['plenty', 'a_few', 'none'] as const)),
		noise: pick(['quiet', 'quiet', 'noisy'] as const),
		long_stays: good
			? i % 4 === 3
				? 'not_really'
				: 'welcome'
			: pick(['welcome', 'not_really'] as const),
		laptop_rules:
			next() < 0.3
				? [pick(['no_laptops_lunch', 'no_laptops_weekends', 'time_limit'] as const)]
				: null,
		checked_in: kind === 'confirmed' ? i < 7 : next() < 0.6,
		created_at: new Date(
			Date.now() -
				(kind === 'confirmed' ? (i === 0 ? 20 : i) : kind === 'revoked' ? 1 + i * 2 : next() * 60) *
					86_400_000
		).toISOString()
	}));
}

await (args.remove ? remove() : add());
