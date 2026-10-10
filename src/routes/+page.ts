import { createSupabaseClient } from '#lib/supabase/client.ts';
import { fetchActiveCities, type CitySummary } from '#lib/supabase/cities.ts';
import type { PageLoad } from './$types';

// Open cities, for the server-rendered page (links) and to pick the city after locating.
export const load: PageLoad = async ({ fetch }) => {
	let cities: CitySummary[] = [];
	try {
		cities = await fetchActiveCities(createSupabaseClient(fetch));
	} catch (err) {
		console.error('Could not load the open cities', err);
	}
	return { cities };
};
