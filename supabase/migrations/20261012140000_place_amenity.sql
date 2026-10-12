-- Place category from OSM (amenity=cafe / amenity=bar), so the list can show a cup or a glass.
-- Filled by scripts/import-osm.ts; null for places suggested by users until reviewed.

create type public.place_amenity as enum ('cafe', 'bar');

alter table public.places add column amenity public.place_amenity;

-- Same view as 20261012120000_place_list.sql, with amenity appended at the end
-- (create or replace view keeps the existing columns and their order).
create or replace view public.place_list_items as
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
	p.lat,
	p.amenity
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
