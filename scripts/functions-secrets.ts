/**
 * Sends the secrets of the send-email Edge Function to the linked project, with
 * `npx supabase secrets set`, without ever printing a value (only names).
 *
 *   npm run functions:secrets            the linked (development) project, values from .env
 *   npm run functions:secrets -- --prod  production (PROD_PROJECT_REF), values from .env.production,
 *                                        without linking the folder to it
 *
 * Reads SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY and EMAIL_FROM from .env. What is missing:
 * - SEND_EMAIL_HOOK_SECRET: generated (v1,whsec_ + 32 random bytes in base64) and added to .env,
 *   where `npx supabase config push` reads it for [auth.hook.send_email];
 * - SEND_EMAIL_HOOK_URI (for config push): added from PUBLIC_SUPABASE_URL;
 * - EMAIL_FROM: added with the Resend test sender only on the development project
 *   (DEV_PROJECT_REF); elsewhere the script stops and asks for an address on the domain.
 * The values travel in a temporary file readable only by you (600), removed even on errors.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

const { values: args } = parseArgs({ options: { prod: { type: 'boolean', default: false } } });
const ENV_FILE = args.prod ? '.env.production' : '.env';
const DEV_SENDER = 'Out of Office <onboarding@resend.dev>';
const FUNCTION_SECRETS = ['SEND_EMAIL_HOOK_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM'] as const;

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

const envText = await readFile(ENV_FILE, 'utf8').catch(() => fail(`${ENV_FILE} not found.`));
const env = parseEnv(envText) as Record<string, string | undefined>;
const value = (name: string) => env[name]?.trim() || undefined;

const linkedRef = args.prod
	? (value('PROD_PROJECT_REF') ?? fail(`Missing PROD_PROJECT_REF in ${ENV_FILE}.`))
	: await readFile('supabase/.temp/project-ref', 'utf8')
			.then((ref) => ref.trim())
			.catch(() =>
				fail('No linked project (supabase/.temp/project-ref): run `npx supabase link`.')
			);
const isDev = !args.prod && linkedRef === value('DEV_PROJECT_REF');

/** Lines to add to .env, written before anything is sent. */
const additions: [string, string][] = [];

if (!value('RESEND_API_KEY')) fail(`Missing RESEND_API_KEY in ${ENV_FILE}.`);

if (!value('SEND_EMAIL_HOOK_SECRET')) {
	additions.push(['SEND_EMAIL_HOOK_SECRET', `v1,whsec_${randomBytes(32).toString('base64')}`]);
}

if (!value('SEND_EMAIL_HOOK_URI')) {
	const url = value('PUBLIC_SUPABASE_URL') ?? fail(`Missing PUBLIC_SUPABASE_URL in ${ENV_FILE}.`);
	const host = new URL(url).hostname;
	if (host !== `${linkedRef}.supabase.co`) {
		fail(`PUBLIC_SUPABASE_URL is not the target project (${linkedRef}): nothing changed.`);
	}
	additions.push(['SEND_EMAIL_HOOK_URI', `https://${host}/functions/v1/send-email`]);
}

if (!value('EMAIL_FROM')) {
	if (!isDev) {
		fail(
			`Missing EMAIL_FROM in ${ENV_FILE}: outside development it must be an address on the ` +
				'verified domain, e.g. EMAIL_FROM="Out of Office <hello@example.com>".'
		);
	}
	additions.push(['EMAIL_FROM', DEV_SENDER]);
}

// .env values with spaces or <> need quotes; none of ours contain a double quote.
const line = ([name, raw]: [string, string]) => `${name}="${raw}"`;

if (additions.length) {
	const separator = envText.endsWith('\n') || envText === '' ? '' : '\n';
	await appendFile(ENV_FILE, separator + additions.map(line).join('\n') + '\n');
	for (const [name] of additions) console.log(`+ ${name} added to ${ENV_FILE}`);
	for (const [name, raw] of additions) env[name] = raw;
}

const dir = await mkdtemp(path.join(tmpdir(), 'functions-secrets-'));
const file = path.join(dir, 'secrets.env');
try {
	await writeFile(
		file,
		FUNCTION_SECRETS.map((name) => line([name, value(name)!])).join('\n') + '\n',
		{ mode: 0o600 }
	);
	console.log(`→ ${FUNCTION_SECRETS.join(', ')} on ${linkedRef}`);
	const result = spawnSync(
		'npx',
		['supabase', 'secrets', 'set', '--env-file', file, `--remote=${linkedRef}`],
		{ stdio: 'inherit' }
	);
	if (result.status !== 0) {
		process.exitCode = 1;
		console.error('\n✖ supabase secrets set failed: nothing else changed on the project.');
	} else {
		console.log('✔ Function secrets set. Next: deploy the function, then config push.');
	}
} finally {
	await rm(dir, { recursive: true, force: true });
}
