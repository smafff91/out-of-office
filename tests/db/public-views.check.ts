/**
 * What anyone holding the public key can read (anon role). Names and dates must never come
 * together, and nothing may let someone follow one person from place to place.
 */
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
	throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY are needed');

const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// PostgREST answers 42703 for a column that does not exist.
const MISSING_COLUMN = '42703';
const IDENTIFYING = ['id', 'user_id', 'profile_id', 'anon_key', 'author_name', 'email'];
const FULL_DATES = ['created_on', 'created_at', 'updated_at', 'last_confirmed_on'];

const VIEWS: Record<string, string[]> = {
	place_notes: ['place_id', 'note', 'created_month'],
	place_contributors: ['place_id', 'display_name']
};

describe.each(Object.entries(VIEWS))('%s', (view, columns) => {
	it.each([...IDENTIFYING, ...FULL_DATES])('has no %s column', async (column) => {
		const { error } = await anon.from(view).select(column).limit(1);
		expect(error?.code).toBe(MISSING_COLUMN);
	});

	it('returns exactly its columns', async () => {
		const { data, error } = await anon.from(view).select('*').limit(20);
		expect(error).toBeNull();
		for (const row of data ?? []) expect(Object.keys(row).sort()).toEqual([...columns].sort());
	});
});

describe('place_notes', () => {
	it('dates notes by month only', async () => {
		const { data, error } = await anon.from('place_notes').select('created_month').limit(50);
		expect(error).toBeNull();
		for (const row of data ?? []) expect(row.created_month).toMatch(/^\d{4}-\d{2}$/);
	});
});

describe('profiles', () => {
	it('cannot be read with the public key', async () => {
		const { data, error } = await anon.from('profiles').select('id, display_name').limit(1);
		// Either refused outright or empty: never a row.
		expect(error !== null || (data ?? []).length === 0).toBe(true);
	});
});

// The profiles grants changed: every public view and function must still answer.
describe('existing public reads', () => {
	let cityId: string;

	beforeAll(async () => {
		const { data, error } = await anon.from('cities').select('id').limit(1).single();
		if (error) throw error;
		cityId = data.id;
	});

	it.each([
		'cities',
		'places',
		'neighborhoods',
		'city_summaries',
		'neighborhood_summaries',
		'city_ranking',
		'place_list_items',
		'place_details',
		'place_scores',
		'place_attributes',
		'place_laptop_rules',
		'certification_settings'
	])('%s', async (view) => {
		const { error } = await anon.from(view).select('*').limit(1);
		expect(error).toBeNull();
	});

	it('city_map_places, city_center_places, score_min_votes, wilson_lower_bound', async () => {
		for (const [fn, args] of [
			['city_map_places', { p_city_id: cityId }],
			['city_center_places', { p_city_id: cityId, p_limit: 1 }],
			['score_min_votes', { p_city_id: cityId }],
			['wilson_lower_bound', { p_yes: 3, p_total: 4 }]
		] as const) {
			const { error } = await anon.rpc(fn, args);
			expect(error, fn).toBeNull();
		}
	});

	it('city_summaries exposes the city languages', async () => {
		const { data, error } = await anon.from('city_summaries').select('slug, languages');
		expect(error).toBeNull();
		for (const row of data ?? []) {
			expect(Array.isArray(row.languages)).toBe(true);
			for (const code of row.languages) expect(code).toMatch(/^[a-z]{2,3}$/);
		}
	});

	it('locate_city (POST)', async () => {
		const { error } = await anon.rpc('locate_city', { p_lat: 41.39, p_lng: 2.17 });
		expect(error).toBeNull();
	});
});
