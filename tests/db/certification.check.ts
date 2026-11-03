/**
 * Certification (feature 8), against the development project only. The rules themselves are
 * checked by supabase/tests/certification.sql (run with the other SQL checks by
 * contributions.check.ts); here:
 * - the opening hours: the database reads every OSM sample of opening-hours.fixtures.json
 *   exactly like parseOpeningHours() in the app (or both give up);
 * - who may call the team's functions through the API: the secret key (npm run certify) yes,
 *   the public key and a signed-in user who is not an admin no. On a temporary city, deleted
 *   afterwards.
 * Needs SUPABASE_SECRET_KEY and DEV_PROJECT_REF in .env, the linked project being the
 * development one, and `npm run dev:grants` applied.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseOpeningHours } from '../../src/lib/places/opening-hours.ts';
import samples from '../../src/lib/places/opening-hours.fixtures.json' with { type: 'json' };

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

describe('opening hours', () => {
	it('are read in SQL exactly as in the app', () => {
		const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
		const dir = mkdtempSync(path.join(tmpdir(), 'opening-hours-'));
		const file = path.join(dir, 'query.sql');
		try {
			// The read-only role cannot call the internal function: a rolled-back transaction, with
			// the --yes the CLI (3.x) asks for.
			writeFileSync(
				file,
				`begin;\nselect s, public.opening_hours_week(s) as w from unnest(array[${samples.map(quote).join(',')}]::text[]) s;\nrollback;\n`
			);
			const result = spawnSync(
				'npx',
				['supabase', 'db', 'query', '--remote', '--yes', '-f', file],
				{
					encoding: 'utf8'
				}
			);
			expect(result.status, result.stderr).toBe(0);
			const rows = (JSON.parse(result.stdout) as { rows: { s: string; w: unknown }[] }).rows;
			expect(rows).toHaveLength(samples.length);
			for (const { s, w } of rows) expect(w, s).toEqual(parseOpeningHours(s) ?? null);
			// Not a comparison of two empty readers.
			expect(rows.filter(({ w }) => w !== null).length).toBeGreaterThan(samples.length / 2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 60_000);
});

describe("the team's functions through the API", () => {
	const runId = crypto.randomUUID().slice(0, 8);
	let cityId: string | undefined;
	let placeId: string;
	let userId: string | undefined;
	let user: SupabaseClient;

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

		const email = `oo-test-${runId}@example.com`;
		const password = crypto.randomUUID();
		const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
		if (created.error) throw created.error;
		userId = created.data.user.id;
		user = createClient(url, key, options);
		const signedIn = await user.auth.signInWithPassword({ email, password });
		if (signedIn.error) throw signedIn.error;
	}, 60_000);

	afterAll(async () => {
		if (userId) await admin.auth.admin.deleteUser(userId);
		if (cityId) {
			await admin.from('places').delete().eq('city_id', cityId);
			await admin.from('cities').delete().eq('id', cityId);
		}
	}, 60_000);

	it('refuses the public key', async () => {
		const pick = await anon.rpc('pick_place', { p_place_id: placeId, p_note: 'desk check' });
		expect(pick.error).not.toBeNull();
		const list = await anon.rpc('certification_list', { p_city_id: cityId });
		expect(list.error).not.toBeNull();
		const info = await anon.rpc('set_place_team_info', {
			p_place_id: placeId,
			p_info: { wifi: 'fast' },
			p_month: '2026-10-01'
		});
		expect(info.error).not.toBeNull();
		const table = await anon.from('place_team_info').select('place_id');
		expect(table.error).not.toBeNull();
	});

	it('refuses a signed-in user who is not an admin', async () => {
		const pick = await user.rpc('pick_place', { p_place_id: placeId, p_note: 'desk check' });
		expect(pick.error?.message).toBe('not_allowed');
		const status = await user.rpc('certification_status', { p_place_id: placeId });
		expect(status.error?.message).toBe('not_allowed');
		const info = await user.rpc('set_place_team_info', {
			p_place_id: placeId,
			p_info: { wifi: 'fast' },
			p_month: '2026-10-01'
		});
		expect(info.error?.message).toBe('not_allowed');
	});

	it('works with the secret key (npm run certify)', async () => {
		const empty = await admin.rpc('pick_place', { p_place_id: placeId, p_note: ' ' });
		expect(empty.error?.message).toBe('note_required');

		const info = await admin.rpc('set_place_team_info', {
			p_place_id: placeId,
			p_info: { wifi: 'available', note: 'Work area upstairs.' },
			p_month: '2026-10-01'
		});
		expect(info.error).toBeNull();
		expect(info.data).toBe('created');

		const pick = await admin.rpc('pick_place', {
			p_place_id: placeId,
			p_note: 'desk check',
			p_picked_on: '2026-10-01'
		});
		expect(pick.error).toBeNull();
		expect(pick.data).toMatchObject({ level: 'certified', origin: 'picked' });

		const details = await anon
			.from('place_details')
			.select('level, cert_origin, certified_on, attributes')
			.eq('id', placeId)
			.single();
		expect(details.error).toBeNull();
		expect(details.data).toMatchObject({
			level: 'certified',
			cert_origin: 'picked',
			certified_on: '2026-10-01',
			attributes: { wifi: { value: 'available', source: 'team', month: '2026-10' } }
		});
		const notes = await anon.from('place_notes').select('note, from_team').eq('place_id', placeId);
		expect(notes.data).toEqual([{ note: 'Work area upstairs.', from_team: true }]);

		const unpick = await admin.rpc('unpick_place', {
			p_place_id: placeId,
			p_reason: 'test',
			p_block: true
		});
		expect(unpick.error).toBeNull();
		expect(unpick.data).toMatchObject({ level: 'osm_only', blocked: true, notice: true });

		const list = await admin.rpc('certification_list', { p_city_id: cityId });
		expect(list.error).toBeNull();
		expect(list.data).toHaveLength(1);
		expect(list.data[0]).toMatchObject({ slug: 'test-place', blocked: true });

		const unblock = await admin.rpc('unblock_place', { p_place_id: placeId, p_reason: 'test' });
		expect(unblock.error).toBeNull();
	}, 30_000);
});
