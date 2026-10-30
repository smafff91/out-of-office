import { error } from '@sveltejs/kit';
import { createSupabaseClient } from '#lib/supabase/client.ts';
import { SLUG } from '#lib/places/slug.ts';
import { fetchCity } from '#lib/supabase/cities.ts';
import { fetchCenterItems, type ListItem } from '#lib/supabase/places.ts';
import type { LayoutLoad } from './$types';

// Small and SSR-friendly: the city, its counts and the first list rows nearest to the city
// center (plain links in the server HTML, so search engines find the place pages); certified
// ones only where the Certified filter starts on.
// Shared by the city map and its place pages. The map pins load in the browser (+layout.svelte).
export const load: LayoutLoad = async ({ fetch, params }) => {
	if (!SLUG.test(params.city)) error(404);
	const supabase = createSupabaseClient(fetch);
	const city = await fetchCity(supabase, params.city);
	if (!city) error(404);

	let centerItems: ListItem[] = [];
	try {
		centerItems = await fetchCenterItems(supabase, city.id, city.certifiedFilterDefault);
	} catch (err) {
		console.error('Could not load the first rows', err);
	}
	return { city, centerItems };
};
