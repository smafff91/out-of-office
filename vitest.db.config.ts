// Checks against the development project with the public (publishable) key only:
//   npm run test:db
// Separate from `npm test` because it needs the network and the latest migration applied.
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/db/**/*.check.ts'],
		env: loadEnv('', process.cwd(), ''),
		testTimeout: 20_000
	}
});
