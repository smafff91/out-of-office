/**
 * Applies the development-only grants in supabase/dev/ (outside the migrations, so they never
 * reach production), with `npx supabase db query --linked`.
 *
 *   npm run dev:grants               apply supabase/dev/fixture-grants.sql
 *   npm run dev:grants -- --revoke   apply supabase/dev/fixture-revoke.sql
 *
 * Refuses to run unless the linked project (supabase/.temp/project-ref) and PUBLIC_SUPABASE_URL
 * are both DEV_PROJECT_REF.
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { revoke: { type: 'boolean', default: false } } });

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

const devRef =
	process.env.DEV_PROJECT_REF?.trim() ||
	fail('Missing DEV_PROJECT_REF in .env (see .env.example).');
const linkedRef = await readFile('supabase/.temp/project-ref', 'utf8')
	.then((ref) => ref.trim())
	.catch(() => fail('No linked project (supabase/.temp/project-ref): run `npx supabase link`.'));
if (linkedRef !== devRef) {
	fail(
		`The linked project (${linkedRef}) is not the development project (${devRef}): nothing changed.`
	);
}
const url = process.env.PUBLIC_SUPABASE_URL?.trim() ?? '';
if (!url || new URL(url).hostname !== `${devRef}.supabase.co`) {
	fail(`PUBLIC_SUPABASE_URL is not the development project (${devRef}): nothing changed.`);
}

const file = args.revoke ? 'supabase/dev/fixture-revoke.sql' : 'supabase/dev/fixture-grants.sql';
console.log(`→ ${file} on ${devRef}`);
const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], {
	stdio: 'inherit'
});
if (result.status !== 0) fail(`Could not apply ${file}.`);
console.log(`✔ ${args.revoke ? 'Revoked' : 'Granted'} test-contribution permissions on ${devRef}.`);
