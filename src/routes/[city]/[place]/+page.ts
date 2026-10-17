import { error } from '@sveltejs/kit';
import { SLUG } from '#lib/places/slug.ts';
import { createSupabaseClient } from '#lib/supabase/client.ts';
import { fetchPlaceDetail } from '#lib/supabase/place-details.ts';
import type { PageLoad } from './$types';

// Rendered on the server for search engines; in the browser, a preview opened just before
// has usually fetched the place already (place-details.ts).
export const load: PageLoad = async ({ fetch, params, parent }) => {
	if (!SLUG.test(params.place)) error(404);
	const { city } = await parent();
	const place = await fetchPlaceDetail(createSupabaseClient(fetch), city.id, params.place);
	if (!place) error(404);
	return { place };
};
