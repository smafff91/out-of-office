import { paraglideVitePlugin } from '@inlang/paraglide-js';
import cloudflare from '@sveltejs/adapter-cloudflare';
import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// BUILD_TARGET=web (default): SSR on Cloudflare, good for SEO.
// BUILD_TARGET=app: client-only SPA with an index.html fallback, packaged later with Capacitor.
const target = process.env.BUILD_TARGET === 'app' ? 'app' : 'web';

export default defineConfig({
	define: {
		__BUILD_TARGET__: JSON.stringify(target)
	},
	plugins: [
		// Compiles messages/*.json into src/lib/paraglide; options in project.inlang/paraglide.config.js.
		paraglideVitePlugin({ project: './project.inlang' }),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: target === 'app' ? staticAdapter({ fallback: 'index.html' }) : cloudflare()
		})
	]
});
