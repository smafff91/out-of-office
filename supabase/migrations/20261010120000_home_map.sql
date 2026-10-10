-- Home map:
-- - city_summaries: active cities with center, bounds and place counts per level.
-- - neighborhood_summaries: neighborhoods with bounds, certified and total places.
-- - city_map_places(): every place of a city as one GeoJSON FeatureCollection (one request,
--   past the API row limit), with only what the map pins need.
-- - locate_city(): the active city around a point, without storing the point.
--
-- "Visible" places: approved, and not gone from OSM unless the community already added info.

-- ---------------------------------------------------------------------------
-- Views (owner rights, like the other public views: they filter approved places themselves)
-- ---------------------------------------------------------------------------

create view public.city_summaries as
with visible_places as (
	select city_id, level
	from public.places
	where review_status = 'approved' and (osm_missing_since is null or level <> 'osm_only')
)
select
	c.id,
	c.slug,
	c.name,
	extensions.st_x(c.center) as center_lng,
	extensions.st_y(c.center) as center_lat,
	extensions.st_xmin(coalesce(c.boundary, c.bbox)) as west,
	extensions.st_ymin(coalesce(c.boundary, c.bbox)) as south,
	extensions.st_xmax(coalesce(c.boundary, c.bbox)) as east,
	extensions.st_ymax(coalesce(c.boundary, c.bbox)) as north,
	(count(p.level) filter (where p.level = 'certified'))::integer as certified_count,
	(count(p.level) filter (where p.level = 'community'))::integer as community_count,
	(count(p.level) filter (where p.level = 'osm_only'))::integer as unchecked_count,
	count(p.level)::integer as places_count
from public.cities c
left join visible_places p on p.city_id = c.id
where c.is_active
group by c.id;

create view public.neighborhood_summaries as
with visible_places as (
	select neighborhood_id, level
	from public.places
	where review_status = 'approved' and (osm_missing_since is null or level <> 'osm_only')
)
select
	n.id,
	n.city_id,
	coalesce(n.short_name, n.name) as name,
	extensions.st_xmin(n.geom) as west,
	extensions.st_ymin(n.geom) as south,
	extensions.st_xmax(n.geom) as east,
	extensions.st_ymax(n.geom) as north,
	(count(p.level) filter (where p.level = 'certified'))::integer as certified_count,
	count(p.level)::integer as places_count
from public.neighborhoods n
left join visible_places p on p.neighborhood_id = n.id
where n.kind = 'neighborhood'
group by n.id;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Map pins of one city. Runs with the caller's rights (RLS applies); coordinates rounded to
-- ~1 m to keep the payload small.
create function public.city_map_places(p_city_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
	select jsonb_build_object(
		'type', 'FeatureCollection',
		'features', coalesce(jsonb_agg(jsonb_build_object(
			'type', 'Feature',
			'geometry', jsonb_build_object(
				'type', 'Point',
				'coordinates', jsonb_build_array(round(p.lng::numeric, 5), round(p.lat::numeric, 5))
			),
			'properties', jsonb_build_object('slug', p.slug, 'name', p.name, 'level', p.level)
		) order by p.level, p.slug), '[]'::jsonb)
	)
	from public.places p
	where p.city_id = p_city_id
		and p.review_status = 'approved'
		and (p.osm_missing_since is null or p.level <> 'osm_only');
$$;

-- Slug of the active city whose boundary contains the point or lies within 25 km of it
-- (the nearest one wins), or null. The 25 km radius lives only here.
-- VOLATILE on purpose: the API then accepts it only as POST, so coordinates travel in the
-- request body and never in a URL that could be logged. Nothing is stored.
create function public.locate_city(p_lat double precision, p_lng double precision)
returns text
language sql
volatile
set search_path = ''
as $$
	with point as (
		select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as geog
	)
	select c.slug
	from public.cities c, point
	where c.is_active
		and extensions.st_dwithin(coalesce(c.boundary, c.bbox)::extensions.geography, point.geog, 25000)
	order by extensions.st_distance(coalesce(c.boundary, c.bbox)::extensions.geography, point.geog)
	limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

grant select on public.city_summaries, public.neighborhood_summaries to anon, authenticated;

revoke execute on function
	public.city_map_places(uuid),
	public.locate_city(double precision, double precision)
	from public, anon, authenticated;
grant execute on function
	public.city_map_places(uuid),
	public.locate_city(double precision, double precision)
	to anon, authenticated;
