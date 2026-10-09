// Paraglide compiler options, read by both the Vite plugin and `paraglide-js compile`.
// Locale on the server: saved choice (cookie) → Accept-Language → English.
// In the browser, src/lib/i18n/locale.ts replaces this chain (see the comment there).
// Language URLs (/es/, /ca/) come later: add the "url" strategy here and a reroute hook.
import { defineConfig } from '@inlang/paraglide-js';

export default defineConfig({
	outdir: './src/lib/paraglide',
	strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
	cookieName: 'locale',
	emitReadme: false,
	// Typed .d.ts files, so TypeScript checks our code against them instead of the generated JS
	// (excluded in tsconfig.json: its JSDoc clashes with the Cloudflare Request types).
	emitTsDeclarations: true
});
