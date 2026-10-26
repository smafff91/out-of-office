/**
 * Founding contributor seats in the DEVELOPMENT project only: frees every seat of a city, so
 * badges handed out while testing do not count.
 *
 *   npm run dev:founding -- --city barcelona --reset
 *
 * Refuses to run unless PUBLIC_SUPABASE_URL belongs to DEV_PROJECT_REF (both in .env).
 * Production has its own project: if badges were handed out there while testing before the
 * launch, the same function (reset_founding_contributors, service_role only) frees them.
 */
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import type { Database } from '#lib/supabase/database.types.ts';

const { values: args } = parseArgs({
	options: { city: { type: 'string' }, reset: { type: 'boolean', default: false } }
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

const citySlug = args.city;
if (!citySlug || !args.reset) fail('Usage: npm run dev:founding -- --city <slug> --reset');
const url = requireEnv('PUBLIC_SUPABASE_URL');
const devRef = requireEnv('DEV_PROJECT_REF');
if (new URL(url).hostname !== `${devRef}.supabase.co`) {
	fail(`PUBLIC_SUPABASE_URL is not the development project (${devRef}): nothing changed.`);
}

const supabase = createClient<Database>(url, requireEnv('SUPABASE_SECRET_KEY'), {
	auth: { persistSession: false, autoRefreshToken: false }
});

const { data: city, error: cityError } = await supabase
	.from('cities')
	.select('id')
	.eq('slug', citySlug)
	.maybeSingle();
if (cityError) fail(cityError.message);
if (!city) fail(`Unknown city "${citySlug}".`);

const { data: freed, error } = await supabase.rpc('reset_founding_contributors', {
	p_city_id: city.id
});
if (error) fail(error.message);
console.log(`✔ Freed ${freed} Founding contributor seats in ${citySlug}.`);
