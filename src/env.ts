import { defineEnvVars } from '@sveltejs/kit/env';

// Public and static: inlined at build time, so they also work in the app build.
export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		static: true,
		description: 'Supabase project URL'
	},
	PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
		public: true,
		static: true,
		description: 'Supabase publishable (anon) key; data is protected by RLS'
	}
});
