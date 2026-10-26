-- Fix for 20261026120000_contributions.sql: place_details calls city_settings(), and a function
-- inside a view runs with the privileges of whoever reads the view (unlike the tables, which
-- use the owner's). Without EXECUTE the view failed for anon and authenticated.
-- city_settings() returns only certification_settings, which is already public.

grant execute on function public.city_settings(uuid) to anon, authenticated;
