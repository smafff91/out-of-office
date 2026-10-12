import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';
import type { Database } from './database.types.ts';

const isBrowser = typeof window !== 'undefined';

let authClient: ReturnType<typeof createClient<Database>> | undefined;

/**
 * The one client that owns sign-in in the browser (session storage, token refresh, magic-link
 * callback). Created once: a second one would start a second GoTrueClient on the same storage.
 */
export function getAuthClient() {
	if (!isBrowser) throw new Error('getAuthClient() is browser-only');
	authClient ??= createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
	});
	return authClient;
}

/**
 * Typed client for reading and writing data. Pass the `fetch` from a load function so
 * SvelteKit can reuse server responses in the browser.
 * - Server: no session at all.
 * - Browser: no auth of its own (no extra GoTrueClient); requests carry the token of the
 *   signed-in user from getAuthClient(), or the publishable key when nobody is signed in.
 */
export function createSupabaseClient(fetchFn: typeof fetch = fetch) {
	if (!isBrowser) {
		return createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
			global: { fetch: fetchFn },
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
		});
	}
	return createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		global: { fetch: fetchFn },
		accessToken: async () =>
			(await getAuthClient().auth.getSession()).data.session?.access_token ?? null
	});
}
