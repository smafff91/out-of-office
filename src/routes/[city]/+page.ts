import { error } from '@sveltejs/kit';
import { createSupabaseClient } from '#lib/supabase/client.ts';
import { fetchCity } from '#lib/supabase/cities.ts';
import { fetchCenterItems, type ListItem } from '#lib/supabase/places.ts';
import type { PageLoad } from './$types';

// Small and SSR-friendly: the city, its counts and the first list rows nearest to the city
// center (plain links in the server HTML, so search engines find the place pages).
// The map pins load in the browser (+page.svelte).
export const load: PageLoad = async ({ fetch, params }) => {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(params.city)) error(404);
	const supabase = createSupabaseClient(fetch);
	const city = await fetchCity(supabase, params.city);
	if (!city) error(404);

	let centerItems: ListItem[] = [];
	try {
		centerItems = await fetchCenterItems(supabase, city.id);
	} catch (err) {
		console.error('Could not load the first rows', err);
	}
	return { city, centerItems };
};
