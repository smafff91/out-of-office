/**
 * Applies this repository to the PRODUCTION project without ever linking the folder to it (the
 * link, supabase/.temp/project-ref, always stays on development: `db query --linked`,
 * `dev:grants` and `test:db` can never touch production). Values come from .env.production
 * (never committed: .env.* is ignored by Git), loaded by `npm run prod`.
 *
 *   npm run prod -- db-push        migrations + seed (dry run first, then asks)
 *   npm run prod -- config-diff    what config push would change in Auth
 *   npm run prod -- config-push    supabase/config.toml, with [remotes.production] on top
 *   npm run prod -- deploy         the Edge Functions (send-email, storage-cleanup)
 *
 * Function secrets: `npm run functions:secrets -- --prod`; cleanup: `npm run photos:prod -- --setup-cleanup`.
 * The database URL (with its password) is read from PROD_DB_URL and passed to the CLI, never
 * printed.
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseEnv } from 'node:util';

const FUNCTIONS = ['send-email', 'storage-cleanup'];
const command = process.argv[2];

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) fail(`Missing ${name} in .env.production (see .env.example).`);
	return value;
}

const prodRef = requireEnv('PROD_PROJECT_REF');
// DEV_PROJECT_REF lives in .env, which this script does not load.
const devEnv = parseEnv(await readFile('.env', 'utf8').catch(() => '')) as Record<string, string>;
const devRef = devEnv.DEV_PROJECT_REF?.trim();
if (!devRef) fail('Missing DEV_PROJECT_REF in .env: needed to tell the two projects apart.');
if (prodRef === devRef) fail('PROD_PROJECT_REF is the development project.');
if (new URL(requireEnv('PUBLIC_SUPABASE_URL')).hostname !== `${prodRef}.supabase.co`) {
	fail('PUBLIC_SUPABASE_URL in .env.production is not PROD_PROJECT_REF.');
}
const linkedRef = (await readFile('supabase/.temp/project-ref', 'utf8').catch(() => '')).trim();
if (linkedRef === prodRef) {
	fail(
		`This folder is linked to production. Link it back first: npx supabase link --project-ref ${devRef}`
	);
}

function run(cliArgs: string[], shown = cliArgs) {
	console.log(`→ npx supabase ${shown.join(' ')}`);
	const result = spawnSync('npx', ['supabase', ...cliArgs], { stdio: 'inherit', env: process.env });
	if (result.status !== 0) fail(`supabase ${shown[0]} failed.`);
}

async function confirm(question: string, expected: string) {
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await prompt.question(question);
	prompt.close();
	return answer.trim() === expected;
}

console.log(`Production project: ${prodRef}`);

switch (command) {
	case 'db-push': {
		const dbUrl = requireEnv('PROD_DB_URL');
		const hidden = ['--db-url', '<PROD_DB_URL>', '--include-seed'];
		run(
			['db', 'push', '--db-url', dbUrl, '--include-seed', '--dry-run'],
			['db', 'push', ...hidden, '--dry-run']
		);
		if (!(await confirm(`Apply these migrations to production? Type ${prodRef}: `, prodRef))) {
			fail('Nothing applied.');
		}
		run(['db', 'push', '--db-url', dbUrl, '--include-seed'], ['db', 'push', ...hidden]);
		break;
	}
	case 'config-diff':
		run(['config', 'diff', '--project-ref', prodRef]);
		break;
	case 'config-push':
		run(['config', 'push', '--project-ref', prodRef]);
		break;
	case 'deploy':
		for (const name of FUNCTIONS) {
			run(['functions', 'deploy', name, '--no-verify-jwt', '--use-api', '--project-ref', prodRef]);
		}
		break;
	default:
		fail('Usage: npm run prod -- db-push | config-diff | config-push | deploy');
}
console.log('✔ Done.');
