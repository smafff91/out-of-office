-- Place list (feature 5):
-- - wilson_lower_bound(): lower bound of the Wilson score interval (z = 1.96), for Top rated;
--   feature 8 reuses it.
-- - score_min_votes(): votes needed to show a percentage, from certification_settings.
-- - city_ranking: places with votes, Wilson bound and section (rated / few_votes).
-- - place_list_items: what a list row shows (neighborhood, hours, score, main attributes).
-- - city_center_places(): the rows nearest to the city center, for the server-rendered list.
-- - neighborhood_summaries gains the district, to group areas by district.
--
-- Views run with the owner's rights like the other public views: they read contributions
-- past RLS and expose only aggregates.

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function public.wilson_lower_bound(p_yes integer, p_total integer)
returns double precision
language sql
immutable
set search_path = ''
as $$
	select case
		when p_total is null or p_total <= 0 then null
		else (
			p_yes::double precision / p_total
			+ 1.96 ^ 2 / (2 * p_total)
			- 1.96 * sqrt(
				(p_yes::double precision / p_total) * (1 - p_yes::double precision / p_total) / p_total
				+ 1.96 ^ 2 / (4 * p_total ^ 2)
			)
		) / (1 + 1.96 ^ 2 / p_total)
	end;
$$;

-- The city's own setting, else the default row, else 5.
create function public.score_min_votes(p_city_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
	select coalesce(
		(select score_min_votes from public.certification_settings where city_id = p_city_id),
		(select score_min_votes from public.certification_settings where city_id is null),
		5
	);
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

create view public.city_ranking as
select
	p.city_id,
	p.slug,
	s.votes,
	s.yes_votes,
	public.wilson_lower_bound(s.yes_votes, s.votes) as wilson,
	case when s.votes >= public.score_min_votes(p.city_id) then 'rated' else 'few_votes' end as section
from public.place_scores s
join public.places p on p.id = s.place_id
where p.review_status = 'approved';

create view public.place_list_items as
select
	p.city_id,
	p.slug,
	p.name,
	p.level,
	coalesce(n.short_name, n.name) as neighborhood,
	p.opening_hours,
	ci.timezone,
	s.votes,
	s.yes_votes,
	s.score_pct,
	s.votes >= public.score_min_votes(p.city_id) as has_score,
	a.wifi,
	a.outlets,
	a.noise,
	r.laptop_rules,
	p.lng,
	p.lat
from public.places p
join public.cities ci on ci.id = p.city_id
left join public.neighborhoods n on n.id = p.neighborhood_id
left join public.place_scores s on s.place_id = p.id
left join lateral (
	select
		max(pa.value) filter (where pa.attribute = 'wifi') as wifi,
		max(pa.value) filter (where pa.attribute = 'outlets') as outlets,
		max(pa.value) filter (where pa.attribute = 'noise') as noise
	from public.place_attributes pa
	where pa.place_id = p.id
) a on true
-- Laptop rules confirmed by at least half of the people who answered the question.
left join lateral (
	select array_agg(lr.rule::text order by lr.confirmations desc, lr.rule) as laptop_rules
	from public.place_laptop_rules lr
	where lr.place_id = p.id
		and lr.rule <> 'none'
		and lr.confirmations * 2 >= (
			select count(*) from public.contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		)
) r on true
where p.review_status = 'approved' and (p.osm_missing_since is null or p.level <> 'osm_only');

-- Same columns as before, plus the district (appended: create or replace keeps the old ones).
create or replace view public.neighborhood_summaries as
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
	count(p.level)::integer as places_count,
	d.id as district_id,
	coalesce(d.short_name, d.name) as district_name
from public.neighborhoods n
left join public.neighborhoods d on d.id = n.parent_id
left join visible_places p on p.neighborhood_id = n.id
where n.kind = 'neighborhood'
group by n.id, d.id;

-- Rows nearest to the city center (public data, never the user's position): the list the
-- server renders as plain links, so search engines find the place pages.
create function public.city_center_places(p_city_id uuid, p_limit integer default 20)
returns setof public.place_list_items
language sql
stable
set search_path = ''
as $$
	select i.*
	from public.place_list_items i
	join public.places p on p.city_id = i.city_id and p.slug = i.slug
	join public.cities c on c.id = p.city_id
	where i.city_id = p_city_id
	order by p.geom operator(extensions.<->) c.center
	limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

grant select on public.city_ranking, public.place_list_items to anon, authenticated;

revoke execute on function
	public.wilson_lower_bound(integer, integer),
	public.score_min_votes(uuid),
	public.city_center_places(uuid, integer)
	from public, anon, authenticated;
grant execute on function
	public.wilson_lower_bound(integer, integer),
	public.score_min_votes(uuid),
	public.city_center_places(uuid, integer)
	to anon, authenticated;
