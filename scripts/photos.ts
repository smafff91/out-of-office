/**
 * Photo moderation from the terminal (the admin pages come with feature 9), and the one-time
 * setup of the file cleanup. Works on the development project (.env) and on production
 * (.env.production), always through the secret key, never through the linked CLI project:
 *
 *   npm run photos -- --list <city>/<place>      every photo of a place (id, state, date, name)
 *   npm run photos -- --hide <photo id>          out of every public view, file kept
 *   npm run photos -- --show <photo id>          visible again
 *   npm run photos -- --remove <photo id>        deleted for good, files included (asks first)
 *   npm run photos -- --setup-cleanup            secret + schedule of the storage-cleanup function
 *   npm run photos:prod -- …                     the same on production (.env.production)
 *
 * --setup-cleanup generates a new shared secret and sets it, without ever printing or saving it,
 * in the storage-cleanup function's secrets (`npx supabase secrets set`, through a temporary
 * file readable only by you, removed even on errors) and then in the project's Vault
 * (configure_storage_cleanup(), which also schedules the pg_cron call). Running it again rotates
 * the secret. Needs `npx supabase login`; the function must be deployed.
 */
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { drain, supabaseQueue } from '../supabase/functions/storage-cleanup/drain.ts';

const { values: args } = parseArgs({
	options: {
		list: { type: 'string' },
		hide: { type: 'string' },
		show: { type: 'string' },
		remove: { type: 'string' },
		'setup-cleanup': { type: 'boolean', default: false },
		yes: { type: 'boolean', default: false }
	}
});

const USAGE =
	'Usage: npm run photos -- --list <city>/<place> | --hide <id> | --show <id> | --remove <id> | --setup-cleanup';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) fail(`Missing ${name} (see .env.example).`);
	return value;
}

const url = requireEnv('PUBLIC_SUPABASE_URL');
const host = new URL(url).hostname;
const ref = host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : '';
if (!/^[a-z0-9]+$/.test(ref)) fail(`PUBLIC_SUPABASE_URL is not a Supabase project URL: ${url}`);
const label = ref === process.env.DEV_PROJECT_REF?.trim() ? 'development' : 'NOT development';
console.log(`→ Project ${ref} (${label})`);

const supabase = createClient(url, requireEnv('SUPABASE_SECRET_KEY'), {
	auth: { persistSession: false, autoRefreshToken: false }
});

function photoId(value: string): string {
	if (!UUID.test(value)) fail(`Not a photo id: ${value}`);
	return value;
}

async function confirm(question: string, expected: string): Promise<boolean> {
	if (args.yes) return true;
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await prompt.question(question);
	prompt.close();
	return answer.trim() === expected;
}

async function moderate(id: string, action: 'hide' | 'show' | 'remove') {
	const { data, error } = await supabase.rpc('moderate_photo', {
		p_photo_id: id,
		p_action: action
	});
	if (error) fail(error.message === 'photo_not_found' ? `No photo ${id}.` : error.message);
	return data as string;
}

async function list(target: string) {
	const [citySlug, placeSlug] = target.split('/');
	if (!citySlug || !placeSlug) fail(USAGE);
	const { data, error } = await supabase.rpc('list_place_photos', {
		p_city_slug: citySlug,
		p_place_slug: placeSlug
	});
	if (error) fail(error.message);
	const rows = (data ?? []) as {
		id: string;
		status: string;
		published: boolean;
		created_at: string;
		display_name: string | null;
	}[];
	if (rows.length === 0) {
		console.log(`No photos for ${target}.`);
		return;
	}
	for (const row of rows) {
		const state = row.published ? row.status : 'booked (not uploaded)';
		console.log(
			`${row.id}  ${state.padEnd(22)}  ${row.created_at.slice(0, 16)}  ${row.display_name ?? '—'}`
		);
	}
	console.log(`Files: ${url}/storage/v1/object/public/place-photos/<id>.webp`);
}

async function setupCleanup() {
	const secret = randomBytes(32).toString('hex');
	const functionUrl = `https://${ref}.supabase.co/functions/v1/storage-cleanup`;
	const redact = (text: string) => text.replaceAll(secret, '***');

	// 1. The function's secret, through a file only you can read.
	const dir = await mkdtemp(path.join(tmpdir(), 'storage-cleanup-'));
	try {
		const file = path.join(dir, 'secret.env');
		await writeFile(file, `STORAGE_CLEANUP_SECRET=${secret}\n`, { mode: 0o600 });
		const result = spawnSync(
			'npx',
			['supabase', 'secrets', 'set', '--env-file', file, `--remote=${ref}`],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		if (result.status !== 0) {
			fail(`supabase secrets set failed: nothing changed.\n${redact(result.stderr ?? '')}`);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
	console.log('✔ Secret set on the storage-cleanup function.');

	// 2. The same secret in Vault, and the pg_cron call.
	const { error } = await supabase.rpc('configure_storage_cleanup', {
		p_url: functionUrl,
		p_secret: secret
	});
	if (error) fail(`configure_storage_cleanup: ${redact(error.message)}`);
	console.log(`✔ Cleanup scheduled on ${ref}: every 10 minutes, only when files wait.`);
}

const actions = [args.list, args.hide, args.show, args.remove, args['setup-cleanup'] || undefined];
if (actions.filter((value) => value !== undefined).length !== 1) fail(USAGE);

if (args.list) {
	await list(args.list);
} else if (args.hide) {
	console.log(`✔ ${await moderate(photoId(args.hide), 'hide')}`);
} else if (args.show) {
	console.log(`✔ ${await moderate(photoId(args.show), 'show')}`);
} else if (args.remove) {
	const id = photoId(args.remove);
	const ok = await confirm(
		`Delete photo ${id} and its files for good? Type the first 8 characters of the id: `,
		id.slice(0, 8)
	);
	if (!ok) fail('Nothing deleted.');
	await moderate(id, 'remove');
	// The files went to the deletion queue with the row: removed now rather than in 10 minutes.
	const { removed, failed } = await drain(supabaseQueue(supabase));
	console.log(
		`✔ Photo deleted; ${removed} queued files removed${failed ? `, ${failed} left for the next run` : ''}.`
	);
} else {
	await setupCleanup();
}
