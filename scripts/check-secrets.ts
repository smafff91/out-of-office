/**
 * Fails if a Supabase secret key ended up in a build output (web or app).
 * Run after `npm run build` / `npm run build:app`: npm run check:secrets
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIRS = ['.svelte-kit/output', '.svelte-kit/cloudflare', 'build'];
// supabase-js itself contains the bare "sb_secret_" prefix, so look for a whole key.
const KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{16,}/;
const secretValue = process.env.SUPABASE_SECRET_KEY?.trim();
const containsSecret = (content: string) =>
	KEY_PATTERN.test(content) ||
	content.includes('SUPABASE_SECRET_KEY') ||
	(!!secretValue && content.includes(secretValue));

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
	console.error(`✖ Secret key found in build output:\n  ${leaks.join('\n  ')}`);
	process.exit(1);
}
console.log(`✔ No secret key in ${scanned} build files (${OUTPUT_DIRS.join(', ')}).`);
