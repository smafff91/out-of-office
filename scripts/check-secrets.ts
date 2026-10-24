/**
 * Fails if a secret ended up in a build output (web or app): the Supabase secret key, the
 * Google sign-in secret, the Resend API key (the last two are for `supabase config push` only).
 * Run after `npm run build` / `npm run build:app`: npm run check:secrets
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIRS = ['.svelte-kit/output', '.svelte-kit/cloudflare', 'build'];
// supabase-js itself contains the bare "sb_secret_" prefix, so look for a whole key.
const KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{16,}/;
const SECRET_NAMES = [
	'SUPABASE_SECRET_KEY',
	'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET',
	'RESEND_API_KEY'
];
const secretValues = SECRET_NAMES.map((name) => process.env[name]?.trim()).filter(
	(value): value is string => !!value
);
const containsSecret = (content: string) =>
	KEY_PATTERN.test(content) ||
	SECRET_NAMES.some((name) => content.includes(name)) ||
	secretValues.some((value) => content.includes(value));

async function* files(dir: string): AsyncGenerator<string> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* files(full);
		else yield full;
	}
}

let scanned = 0;
const leaks: string[] = [];
for (const dir of OUTPUT_DIRS) {
	for await (const file of files(dir)) {
		scanned++;
		const content = await readFile(file, 'latin1');
		if (containsSecret(content)) leaks.push(file);
	}
}

if (leaks.length) {
	console.error(`✖ Secret found in build output:\n  ${leaks.join('\n  ')}`);
	process.exit(1);
}
console.log(`✔ No secret in ${scanned} build files (${OUTPUT_DIRS.join(', ')}).`);
