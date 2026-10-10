import { error } from '@sveltejs/kit';
import { createSupabaseClient } from '#lib/supabase/client.ts';
import { fetchCity } from '#lib/supabase/cities.ts';
import type { PageLoad } from './$types';

// Small and SSR-friendly: the city and its counts. The pins load in the browser (+page.svelte).
export const load: PageLoad = async ({ fetch, params }) => {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(params.city)) error(404);
	const city = await fetchCity(createSupabaseClient(fetch), params.city);
	if (!city) error(404);
	return { city };
};
