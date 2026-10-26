/**
 * Photo rules with real files (feature 7c), against the development project only:
 * - the SQL checks in supabase/tests/photos.sql (rolled-back transaction, nothing stays);
 * - the bucket rules through the Storage API with the public key: only a name the user booked,
 *   only WebP, only under each bucket's cap, no overwrite, nothing for anonymous visitors;
 * - the whole flow (book → upload → publish → public view) and the deletion of the files with
 *   the account (deletion queue drained like the storage-cleanup function does).
 * A temporary city, place and two confirmed test accounts, all deleted at the end.
 * Needs SUPABASE_SECRET_KEY and DEV_PROJECT_REF in .env, the linked project being the
 * development one, and `npm run dev:grants` applied.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drain, supabaseQueue } from '../../supabase/functions/storage-cleanup/drain.ts';

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

const LARGE = 'place-photos';
const THUMB = 'place-photo-thumbs';
// A valid 1 × 1 WebP.
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const webp = (bytes: Uint8Array<ArrayBuffer> = new Uint8Array(WEBP)) =>
	new Blob([bytes], { type: 'image/webp' });
/** A WebP header padded to a given size (only the size matters to the bucket). */
const padded = (size: number) => {
	const bytes = new Uint8Array(size);
	bytes.set(WEBP);
	return webp(bytes);
};
const upload = (client: SupabaseClient, bucket: string, path: string, file: Blob, upsert = false) =>
	client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert });

const ANSWERS = {
	p_would_work_again: true,
	p_wifi: 'fast',
	p_outlets: 'plenty',
	p_noise: 'quiet',
	p_long_stays: 'welcome'
};

describe('supabase/tests/photos.sql', () => {
	it('passes', () => {
		const result = spawnSync(
			'npx',
			['supabase', 'db', 'query', '--linked', '-f', 'supabase/tests/photos.sql'],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('photos: ok');
	}, 60_000);
});

describe('photo files', () => {
	const runId = crypto.randomUUID().slice(0, 8);
	let cityId: string | undefined;
	let placeId: string;
	const userIds: string[] = [];
	const clients: SupabaseClient[] = [];
	let contributionId: string;
	let path: string;
	let photoId: string;

	beforeAll(async () => {
		const city = await admin
			.from('cities')
			.insert({
				slug: `zz-test-photos-${runId}`,
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

		for (let i = 0; i < 2; i++) {
			const email = `oo-test-photos-${runId}-${i}@example.com`;
			const password = crypto.randomUUID();
			const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
			if (created.error) throw created.error;
			userIds.push(created.data.user.id);
			const client = createClient(url, key, options);
			const signedIn = await client.auth.signInWithPassword({ email, password });
			if (signedIn.error) throw signedIn.error;
			clients.push(client);
		}

		const submitted = await clients[0].rpc('submit_contribution', {
			p_place_id: placeId,
			...ANSWERS
		});
		if (submitted.error) throw submitted.error;
		contributionId = submitted.data.id;
		const booked = await clients[0].rpc('reserve_photo', {
			p_contribution_id: contributionId,
			p_width: 1,
			p_height: 1,
			p_terms_version: '2026-10-29'
		});
		if (booked.error) throw booked.error;
		({ id: photoId, path } = booked.data);
	}, 60_000);

	afterAll(async () => {
		// Users still here (a failed test) and the temporary place: their photo rows go with
		// them, the files through the queue.
		for (const id of userIds) await admin.auth.admin.deleteUser(id);
		if (cityId) {
			await admin.from('places').delete().eq('city_id', cityId);
			await admin.from('cities').delete().eq('id', cityId);
		}
		await drain(supabaseQueue(admin));
	}, 60_000);

	it('nobody signed out can upload', async () => {
		const { error } = await upload(anon, LARGE, path, webp());
		expect(error).not.toBeNull();
	});

	it('a name nobody booked is refused', async () => {
		const { error } = await upload(clients[0], LARGE, `${crypto.randomUUID()}.webp`, webp());
		expect(error).not.toBeNull();
	});

	it("someone else's booking is refused", async () => {
		const { error } = await upload(clients[1], LARGE, path, webp());
		expect(error).not.toBeNull();
	});

	it('only WebP', async () => {
		const png = new Blob([WEBP], { type: 'image/png' });
		expect((await upload(clients[0], LARGE, path, png)).error).not.toBeNull();
		const jpeg = new Blob([WEBP], { type: 'image/jpeg' });
		expect((await upload(clients[0], THUMB, path, jpeg)).error).not.toBeNull();
	});

	it('nothing above each bucket cap (1 MiB, 150 KiB)', async () => {
		expect((await upload(clients[0], LARGE, path, padded(1024 * 1024 + 1))).error).not.toBeNull();
		expect((await upload(clients[0], THUMB, path, padded(150 * 1024 + 1))).error).not.toBeNull();
	}, 30_000);

	it('publishes only once both files are there, then shows the photo', async () => {
		expect((await upload(clients[0], LARGE, path, webp())).error).toBeNull();
		const early = await clients[0].rpc('publish_photo', { p_photo_id: photoId });
		expect(early.error?.message).toBe('photo_files_missing');

		expect((await upload(clients[0], THUMB, path, webp())).error).toBeNull();
		const published = await clients[0].rpc('publish_photo', { p_photo_id: photoId });
		expect(published.error).toBeNull();

		const { data, error } = await anon.from('place_photos').select('*').eq('place_id', placeId);
		expect(error).toBeNull();
		expect(data).toEqual([
			{ place_id: placeId, path, width: 1, height: 1, credit: null, sort_order: 1 }
		]);

		const file = await fetch(`${url}/storage/v1/object/public/${THUMB}/${path}`);
		expect(file.status).toBe(200);
		expect(file.headers.get('content-type')).toBe('image/webp');
	}, 30_000);

	it('a published file cannot be overwritten, listed or deleted by the app', async () => {
		expect((await upload(clients[0], LARGE, path, webp(), true)).error).not.toBeNull();
		expect((await upload(clients[1], LARGE, path, webp(), true)).error).not.toBeNull();

		const listed = await clients[1].storage.from(LARGE).list();
		expect(listed.data ?? []).toEqual([]);

		await clients[1].storage.from(LARGE).remove([path]);
		await clients[0].storage.from(LARGE).remove([path]);
		expect((await admin.storage.from(LARGE).download(path)).error).toBeNull();
	});

	it("delete_my_photo leaves someone else's photo alone", async () => {
		const { data, error } = await clients[1].rpc('delete_my_photo', { p_photo_id: photoId });
		expect(error).toBeNull();
		expect(data).toBe(false);
	});

	it('the app cannot read the photos table or the deletion queue', async () => {
		for (const table of ['photos', 'visible_photos', 'storage_deletions']) {
			const { data, error } = await clients[0].from(table).select('*').limit(1);
			expect(error !== null || (data ?? []).length === 0, table).toBe(true);
		}
	});

	it('deleting the account deletes the photos, files included', async () => {
		const deleted = await admin.auth.admin.deleteUser(userIds[0]);
		expect(deleted.error).toBeNull();
		userIds.shift();

		const { data } = await anon.from('place_photos').select('path').eq('place_id', placeId);
		expect(data).toEqual([]);

		const { removed, failed } = await drain(supabaseQueue(admin));
		expect(failed).toBe(0);
		expect(removed).toBeGreaterThanOrEqual(2);
		expect((await admin.storage.from(LARGE).download(path)).error).not.toBeNull();
		expect((await admin.storage.from(THUMB).download(path)).error).not.toBeNull();
	}, 30_000);
});
