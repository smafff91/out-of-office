// Checks against the development project:
//   npm run test:db
// public-views uses the public (publishable) key only; contributions also runs the SQL checks
// in supabase/tests/ and uses the secret key for temporary test accounts (development only).
// Separate from `npm test` because it needs the network and the latest migration applied.
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/db/**/*.check.ts'],
		env: loadEnv('', process.cwd(), ''),
		testTimeout: 20_000,
		// One file at a time: contributions and certification both call `supabase db query
		// --linked`, and two of them at once can hang on the CLI's login role.
		fileParallelism: false
	}
});
