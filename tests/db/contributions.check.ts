/**
 * Contribution rules (feature 7b), against the development project only:
 * - the SQL checks in supabase/tests/ (rolled-back transactions, nothing stays);
 * - what the public key can do with contributions (nothing but the public views);
 * - Founding seats under simultaneous submissions: a temporary city with a limit of 3, six
 *   confirmed test accounts submitting at the same time, then everything is deleted.
 * Needs SUPABASE_SECRET_KEY and DEV_PROJECT_REF in .env, the linked project being the
 * development one, and `npm run dev:grants` applied.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const devRef = process.env.DEV_PROJECT_REF?.trim();
if (!url || !key || !secret || !devRef) {
	throw new Error(
		'PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY and DEV_PROJECT_REF are needed'
	);
}
if (new URL(url).hostname !== `${devRef}.supabase.co`) {
	throw new Error(`PUBLIC_SUPABASE_URL is not the development project (${devRef})`);
}
const linkedRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (linkedRef !== devRef) {
	throw new Error(`The linked project (${linkedRef}) is not the development project (${devRef})`);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, key, options);
const admin = createClient(url, secret, options);

const ANSWERS = {
	p_would_work_again: true,
	p_wifi: 'fast',
	p_outlets: 'plenty',
	p_noise: 'quiet',
	p_long_stays: 'welcome'
};

// One file runs every SQL check, one after the other: two `supabase db query --linked` started
// at the same time (test files run in parallel) can hang on the CLI's login role.
describe.each(['contributions.sql', 'profile_visibility.sql', 'photos.sql'])(
	'supabase/tests/%s',
	(file) => {
		it('passes', () => {
			const result = spawnSync(
				'npx',
				['supabase', 'db', 'query', '--linked', '-f', `supabase/tests/${file}`],
				{ encoding: 'utf8' }
			);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain(`${file.replace('.sql', '')}: ok`);
		}, 60_000);
	}
);

describe('with the public key', () => {
	let placeId: string;

	beforeAll(async () => {
		const { data, error } = await anon.from('place_details').select('id').limit(1).single();
		if (error) throw error;
		placeId = data.id;
	});

	it('cannot read contributions or Founding seats', async () => {
		for (const table of ['contributions', 'active_contributions', 'founding_contributors']) {
			const { data, error } = await anon.from(table).select('*').limit(1);
			expect(error !== null || (data ?? []).length === 0, table).toBe(true);
		}
	});

	it('cannot insert a contribution', async () => {
		const { error } = await anon.from('contributions').insert({
			place_id: placeId,
			would_work_again: true,
			wifi: 'fast',
			outlets: 'plenty',
			noise: 'quiet',
			long_stays: 'welcome'
		});
		expect(error).not.toBeNull();
	});

	it('cannot call submit_contribution or my_recent_contribution', async () => {
		const submit = await anon.rpc('submit_contribution', { p_place_id: placeId, ...ANSWERS });
		expect(submit.error).not.toBeNull();
		const mine = await anon.rpc('my_recent_contribution', { p_place_id: placeId });
		expect(mine.error).not.toBeNull();
	});
});

describe('Founding seats with simultaneous submissions', () => {
	const USERS = 6;
	const LIMIT = 3;
	const runId = crypto.randomUUID().slice(0, 8);
	let cityId: string | undefined;
	let placeId: string;
	const userIds: string[] = [];
	const clients: SupabaseClient[] = [];

	beforeAll(async () => {
		const city = await admin
			.from('cities')
			.insert({
				slug: `zz-test-${runId}`,
				name: 'Test city',
				country_code: 'ES',
				timezone: 'Europe/Madrid',
				center: 'SRID=4326;POINT(2.17 41.39)',
				bbox: 'SRID=4326;POLYGON((2.1 41.3,2.3 41.3,2.3 41.5,2.1 41.5,2.1 41.3))',
				is_active: false
			})
			.select('id')
			.single();
		if (city.error) throw new Error(`${city.error.message} (npm run dev:grants?)`);
		cityId = city.data.id;

		const place = await admin
			.from('places')
			.insert({
				city_id: cityId,
				slug: 'test-place',
				name: 'Test place',
				geom: 'SRID=4326;POINT(2.17 41.39)'
			})
			.select('id')
			.single();
		if (place.error) throw place.error;
		placeId = place.data.id;

		const defaults = await admin
			.from('certification_settings')
			.select('*')
			.is('city_id', null)
			.single();
		if (defaults.error) throw defaults.error;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { id, updated_at, ...settings } = defaults.data;
		const inserted = await admin
			.from('certification_settings')
			.insert({ ...settings, city_id: cityId, founding_limit: LIMIT });
		if (inserted.error) throw inserted.error;

		for (let i = 0; i < USERS; i++) {
			const email = `oo-test-${runId}-${i}@example.com`;
			const password = crypto.randomUUID();
			const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
			if (created.error) throw created.error;
			userIds.push(created.data.user.id);
			const client = createClient(url, key, options);
			const signedIn = await client.auth.signInWithPassword({ email, password });
			if (signedIn.error) throw signedIn.error;
			clients.push(client);
		}
	}, 60_000);

	afterAll(async () => {
		for (const id of userIds) await admin.auth.admin.deleteUser(id);
		if (cityId) {
			await admin.from('places').delete().eq('city_id', cityId);
			await admin.from('cities').delete().eq('id', cityId);
		}
	}, 60_000);

	it('refuses GET requests', async () => {
		const { error } = await clients[0].rpc(
			'submit_contribution',
			{ p_place_id: placeId, ...ANSWERS },
			{ get: true }
		);
		expect(error).not.toBeNull();
	});

	it(`gives exactly ${LIMIT} seats to different users`, async () => {
		const results = await Promise.all(
			clients.map((client) =>
				client.rpc('submit_contribution', { p_place_id: placeId, ...ANSWERS })
			)
		);
		for (const { error } of results) expect(error).toBeNull();
		const founding = results.filter(({ data }) => data.founding === true);
		expect(founding).toHaveLength(LIMIT);

		const seats = await admin
			.from('founding_contributors')
			.select('seat, user_id')
			.eq('city_id', cityId!)
			.order('seat');
		expect(seats.error).toBeNull();
		expect(seats.data?.map((row) => row.seat)).toEqual([1, 2, 3]);
		expect(new Set(seats.data?.map((row) => row.user_id)).size).toBe(LIMIT);
	}, 30_000);
});
