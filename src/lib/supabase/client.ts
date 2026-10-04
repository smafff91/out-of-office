import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';
import type { Database } from './database.types.ts';

const isBrowser = typeof window !== 'undefined';

/**
 * Typed Supabase client. Pass the `fetch` from a load function so SvelteKit can reuse
 * server responses in the browser. Sessions are kept only in the browser; sign-in comes later.
 */
export function createSupabaseClient(fetchFn: typeof fetch = fetch) {
	return createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		global: { fetch: fetchFn },
		auth: {
			persistSession: isBrowser,
			autoRefreshToken: isBrowser,
			detectSessionInUrl: isBrowser
		}
	});
}
