import { error } from '@sveltejs/kit';
import { SLUG } from '#lib/places/slug.ts';
import { createSupabaseClient } from '#lib/supabase/client.ts';
import {
	fetchPlaceCommunity,
	fetchPlaceDetail,
	PLACE_DEPENDENCY
} from '#lib/supabase/place-details.ts';
import type { LayoutLoad } from './$types';

// Shared by the place page and its update form (/{city}/{place}/update).
// Rendered on the server for search engines; in the browser, a preview opened just before
// has usually fetched the place already (place-details.ts).
export const load: LayoutLoad = async ({ fetch, params, parent, depends }) => {
	depends(PLACE_DEPENDENCY);
	if (!SLUG.test(params.place)) error(404);
	const { city } = await parent();
	const supabase = createSupabaseClient(fetch);
	const detail = await fetchPlaceDetail(supabase, city.id, params.place);
	if (!detail) error(404);
	try {
		return { place: { ...detail, ...(await fetchPlaceCommunity(supabase, detail.id)) } };
	} catch (err) {
		// Names and notes are extras: the page works without them.
		console.error('Could not load the names and notes', err);
		return { place: detail };
	}
};
