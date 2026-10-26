// Deletes the files of deleted photos (see handler.ts). Deployed with
// `npx supabase functions deploy storage-cleanup --no-verify-jwt --use-api`: pg_cron calls it
// with the shared secret instead of a user token. Secret: `npm run photos -- --setup-cleanup`.
import { createClient } from '@supabase/supabase-js';
import { supabaseQueue } from './drain.ts';
import { handleStorageCleanup } from './handler.ts';

/** The service role key, legacy or new style (SUPABASE_SECRET_KEYS is a JSON object). */
function serviceKey(): string {
	const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (legacy) return legacy;
	const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
	return keys.default ?? Object.values(keys)[0] ?? '';
}

Deno.serve((request) =>
	handleStorageCleanup(
		request,
		{ STORAGE_CLEANUP_SECRET: Deno.env.get('STORAGE_CLEANUP_SECRET') },
		() =>
			supabaseQueue(
				createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
					auth: { persistSession: false, autoRefreshToken: false }
				})
			)
	)
);
