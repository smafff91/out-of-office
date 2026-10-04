import type { Handle } from '@sveltejs/kit/hooks';

// supabase-js reads these headers from responses fetched during SSR load functions;
// SvelteKit must serialize them so the same responses can be reused in the browser.
const SUPABASE_HEADERS = new Set(['content-range', 'x-supabase-api-version']);

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		filterSerializedResponseHeaders: (name) => SUPABASE_HEADERS.has(name)
	});
