-- locate_city: refuse GET requests explicitly.
-- VOLATILE alone does not stop the API from serving GET (it runs it read-only), so coordinates
-- could end up in a URL. The function now checks the request method set by the API and fails
-- on GET: the app must send coordinates in a POST body. Nothing is stored.

create or replace function public.locate_city(p_lat double precision, p_lng double precision)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
	v_point extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
	v_slug text;
begin
	if current_setting('request.method', true) = 'GET' then
		raise exception 'locate_city accepts only POST requests' using errcode = '42501';
	end if;

	-- The 25 km radius lives only here.
	select c.slug into v_slug
	from public.cities c
	where c.is_active
		and extensions.st_dwithin(coalesce(c.boundary, c.bbox)::extensions.geography, v_point, 25000)
	order by extensions.st_distance(coalesce(c.boundary, c.bbox)::extensions.geography, v_point)
	limit 1;

	return v_slug;
end;
$$;

-- create or replace keeps the existing grants; restated here for clarity.
revoke execute on function public.locate_city(double precision, double precision) from public;
grant execute on function public.locate_city(double precision, double precision) to anon, authenticated;
