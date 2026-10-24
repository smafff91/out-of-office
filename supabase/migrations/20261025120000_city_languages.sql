-- Language picker (feature 7a):
-- - cities.languages: the languages spoken in the city, suggested first in the picker when the
--   app has many languages. Data, not code: a new city sets its own. Exposed by city_summaries.
-- - profiles.locale_chosen_at: when the user last picked a language, so that on sign-in the
--   latest explicit choice (this device or the profile) wins.

alter table public.cities
	add column languages text[] not null default '{}'
	-- Any 2–3 letter code, no empty entries: a new app language needs no migration.
	check (
		array_position(languages, null) is null
		and '' <> all (languages)
		and array_to_string(languages, ',') ~ '^([a-z]{2,3}(,[a-z]{2,3})*)?$'
	);

update public.cities set languages = '{ca,es}' where slug = 'barcelona';

-- Same columns in the same order (create or replace view only appends): languages at the end.
create or replace view public.city_summaries as
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
	count(p.level)::integer as places_count,
	c.languages
from public.cities c
left join visible_places p on p.city_id = c.id
where c.is_active
group by c.id;

alter table public.profiles add column locale_chosen_at timestamptz;

grant select (locale_chosen_at) on public.profiles to authenticated;
grant update (locale_chosen_at) on public.profiles to authenticated;
