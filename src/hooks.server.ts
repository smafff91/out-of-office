import type { Handle } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

// supabase-js reads these headers from responses fetched during SSR load functions;
// SvelteKit must serialize them so the same responses can be reused in the browser.
const SUPABASE_HEADERS = new Set(['content-range', 'x-supabase-api-version']);

// The locale comes from the cookie, else Accept-Language (project.inlang/paraglide.config.js):
// pages differ per visitor, so no shared cache may store them.
const HTML_VARY = ['Cookie', 'Accept-Language'];

export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, async ({ locale }) => {
		const response = await resolve(event, {
			filterSerializedResponseHeaders: (name) => SUPABASE_HEADERS.has(name),
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});

		if (response.headers.get('content-type')?.startsWith('text/html')) {
			for (const header of HTML_VARY) response.headers.append('Vary', header);
			response.headers.set('Cache-Control', 'private, no-cache');
		}
		return response;
	});
