import { createSupabaseClient } from '#lib/supabase/client.ts';
import type { PageLoad } from './$types';

// Temporary check that the database is reachable: read the active cities.
export const load: PageLoad = async ({ fetch }) => {
	const supabase = createSupabaseClient(fetch);
	const { data, error } = await supabase
		.from('cities')
		.select('slug, name')
		.eq('is_active', true)
		.order('name');

	return { cities: data ?? [], dbError: error !== null };
};
