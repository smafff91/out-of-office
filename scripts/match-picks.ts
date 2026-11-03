/**
 * Matches a picks file to the places of its city (read only, public key):
 *
 *   npm run picks:match -- --file data/picks/<city>-picks-<month>.json [--dry-run]
 *
 * Prints three groups (certain, ambiguous with their candidates, not found) and writes the slug
 * of each certain row into the file (--dry-run: writes nothing). A row that already has a slug
 * is only checked, and one with "slug": null (left out by the team) is never matched again.
 * Ambiguous rows and branches to choose stay without a slug: the team writes the chosen one, or
 * null. Matching rules: scripts/pick-match.ts. Then: npm run certify -- --pick-file.
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { matchPick, type Candidate, type Match, type PickRow } from './pick-match.ts';

const { values: args } = parseArgs({
	options: {
		file: { type: 'string' },
		'dry-run': { type: 'boolean', default: false }
	}
});

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) fail(`Missing ${name} (see .env.example).`);
	return value;
}

if (!args.file) fail('Usage: npm run picks:match -- --file <picks.json> [--dry-run]');
const url = requireEnv('PUBLIC_SUPABASE_URL');
const supabase = createClient(url, requireEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
	auth: { persistSession: false, autoRefreshToken: false }
});

type PicksFile = { city: string; places: PickRow[] };
const file = JSON.parse(await readFile(args.file, 'utf8')) as PicksFile;
if (!file.city || !Array.isArray(file.places)) fail(`${args.file}: needs "city" and "places".`);

const city = await supabase.from('cities').select('id').eq('slug', file.city).maybeSingle();
if (city.error || !city.data) fail(`City ${file.city} not found.`);

const areas = await supabase
	.from('neighborhoods')
	.select('id, name, parent_id')
	.eq('city_id', city.data.id);
if (areas.error) fail(areas.error.message);
const areaById = new Map(areas.data.map((area) => [area.id, area]));

const places: Candidate[] = [];
for (let from = 0; ; from += 1000) {
	const page = await supabase
		.from('places')
		.select('slug, name, address, neighborhood_id, osm_missing_since')
		.eq('city_id', city.data.id)
		.eq('review_status', 'approved')
		.order('slug')
		.range(from, from + 999);
	if (page.error) fail(page.error.message);
	for (const row of page.data) {
		const barri = row.neighborhood_id ? areaById.get(row.neighborhood_id) : undefined;
		const district = barri?.parent_id ? areaById.get(barri.parent_id) : undefined;
		places.push({
			slug: row.slug,
			name: row.name,
			address: row.address,
			barri: barri?.name ?? null,
			district: district?.name ?? null,
			missingFromOsm: row.osm_missing_since !== null
		});
	}
	if (page.data.length < 1000) break;
}
console.log(`→ ${places.length} places in ${file.city} (${new URL(url).hostname})\n`);

const bySlug = new Map(places.map((place) => [place.slug, place]));
const results = file.places.map((row): { row: PickRow; match: Match } => {
	// null: the team decided to leave this row out; it is never matched again.
	if (row.slug === null) return { row, match: { kind: 'not_found', why: 'left out (slug: null)' } };
	if (row.slug) {
		const place = bySlug.get(row.slug);
		return place
			? { row, match: { kind: 'certain', place, why: 'slug already in the file' } }
			: { row, match: { kind: 'not_found', why: `slug ${row.slug} not found` } };
	}
	return { row, match: matchPick(row, places) };
});

const where = (place: Candidate) =>
	[place.address ?? 'no address', place.barri, place.missingFromOsm ? 'MISSING FROM OSM' : '']
		.filter(Boolean)
		.join(' · ');
const label = (row: PickRow, index: number) =>
	`${String(index + 1).padStart(2)}. ${row.name} — ${row.address} (${row.district})`;

console.log('CERTAIN');
results.forEach(({ row, match }, index) => {
	if (match.kind !== 'certain') return;
	console.log(
		`${label(row, index)}\n      → ${match.place.slug} [${match.place.name} · ${where(match.place)}] (${match.why})`
	);
});
console.log('\nAMBIGUOUS');
results.forEach(({ row, match }, index) => {
	if (match.kind !== 'ambiguous') return;
	console.log(`${label(row, index)} — ${match.why}`);
	for (const place of match.candidates) {
		console.log(`      ? ${place.slug} [${place.name} · ${where(place)}]`);
	}
});
console.log('\nNOT FOUND');
results.forEach(({ row, match }, index) => {
	if (match.kind === 'not_found') console.log(`${label(row, index)} — ${match.why}`);
});

const certain = results.filter(({ match }) => match.kind === 'certain');
console.log(
	`\n${certain.length} certain, ${results.filter(({ match }) => match.kind === 'ambiguous').length} ambiguous, ${results.filter(({ match }) => match.kind === 'not_found').length} not found.`
);

const duplicates = certain
	.map(({ match }) => (match.kind === 'certain' ? match.place.slug : ''))
	.filter((slug, index, all) => all.indexOf(slug) !== index);
if (duplicates.length)
	fail(`The same place for several rows: ${duplicates.join(', ')}. Nothing written.`);

if (args['dry-run']) {
	console.log('Dry run: the file is unchanged.');
} else {
	for (const { row, match } of results) {
		if (match.kind === 'certain') row.slug = match.place.slug;
	}
	const text = await format(JSON.stringify(file), {
		...(await resolveConfig(args.file)),
		filepath: args.file
	});
	await writeFile(args.file, text);
	console.log(`✔ Slugs of the certain rows written to ${args.file}.`);
}
