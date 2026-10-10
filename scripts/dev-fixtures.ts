/**
 * Test data for the DEVELOPMENT project only: marks a few places near the city center as
 * certified or community, so the map shows all three pin types and real launch counts.
 *
 *   npm run dev:fixtures -- --city barcelona            add them
 *   npm run dev:fixtures -- --city barcelona --remove   put those places back exactly as they were
 *
 * Changes only places.level / cert_origin / certified_at (no users, no contributions). The
 * touched places and their previous values are saved in .cache/dev-fixtures/<city>.json.
 * Refuses to run unless PUBLIC_SUPABASE_URL belongs to DEV_PROJECT_REF (both in .env).
 * Feature 8 derives levels from contributions: these fixtures will be replaced by test
 * contributions then.
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
type Saved = Pick<Place, 'id' | 'name' | 'level' | 'cert_origin' | 'certified_at'>;

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

async function readSaved(): Promise<Saved[] | undefined> {
	try {
		return JSON.parse(await readFile(cacheFile, 'utf8')) as Saved[];
	} catch {
		return undefined;
	}
}

async function remove() {
	const saved = (await readSaved()) ?? fail(`No fixtures to remove (${cacheFile} not found).`);
	for (const place of saved) {
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
	console.log(`✔ Restored ${saved.length} places in ${citySlug}.`);
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
	await writeFile(cacheFile, `${JSON.stringify(saved, null, '\t')}\n`);

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
		console.log(`  ${certified ? 'certified' : 'community'}  ${place.name}`);
	}
	console.log(
		`✔ Fixtures added in ${citySlug}. Undo: npm run dev:fixtures -- --city ${citySlug} --remove`
	);
}

await (args.remove ? remove() : add());
