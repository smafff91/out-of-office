-- Place page and tap preview (feature 6):
-- - place_details: everything the place page shows, one row per place.
--
-- Like the other public views it runs with the owner's rights and exposes only aggregates:
-- counts, prevailing values and days (in the city's timezone). Never user_id, anon_key, exact
-- times, distances or the check-in of a single contribution.

create view public.place_details as
select
	p.city_id,
	p.slug,
	p.name,
	p.amenity,
	p.level,
	-- Shown only for certified places ("Visited by our team" / "Confirmed by N users").
	case when p.level = 'certified' then p.cert_origin end as cert_origin,
	case when p.level = 'certified' then (p.certified_at at time zone ci.timezone)::date end
		as certified_on,
	coalesce(n.short_name, n.name) as neighborhood,
	coalesce(d.short_name, d.name) as district,
	p.address,
	p.lng,
	p.lat,
	p.opening_hours,
	ci.timezone,
	p.internet_access_osm,
	p.osm_type,
	p.osm_id,
	p.osm_missing_since is not null as may_have_closed,
	coalesce(s.votes, 0) as votes,
	coalesce(s.yes_votes, 0) as yes_votes,
	s.score_pct,
	coalesce(s.votes >= public.score_min_votes(p.city_id), false) as has_score,
	-- Distinct people (an account, or the random key left by a deleted one).
	coalesce(u.contributors, 0) as contributors,
	coalesce(
		(select cs.min_users from public.certification_settings cs where cs.city_id = p.city_id),
		(select cs.min_users from public.certification_settings cs where cs.city_id is null)
	) as min_users,
	coalesce(a.attributes, '{}'::jsonb) as attributes,
	coalesce(r.laptop_rules, '[]'::jsonb) as laptop_rules
from public.places p
join public.cities ci on ci.id = p.city_id
left join public.neighborhoods n on n.id = p.neighborhood_id
left join public.neighborhoods d on d.id = n.parent_id
left join public.place_scores s on s.place_id = p.id
left join lateral (
	select count(distinct coalesce(c.user_id, c.anon_key))::integer as contributors
	from public.contributions c
	where c.place_id = p.id
) u on true
-- { "wifi": { "value": "fast", "confirmations": 4, "last_confirmed_on": "2026-10-14" }, … }
left join lateral (
	select jsonb_object_agg(
		pa.attribute,
		jsonb_build_object(
			'value', pa.value,
			'confirmations', pa.confirmations,
			'last_confirmed_on', pa.last_confirmed_on
		)
	) as attributes
	from public.place_attributes pa
	where pa.place_id = p.id
) a on true
-- Laptop rules confirmed by at least half of the people who answered the question
-- (same rule as place_list_items).
left join lateral (
	select jsonb_agg(
		jsonb_build_object(
			'rule', lr.rule,
			'confirmations', lr.confirmations,
			'last_confirmed_on', lr.last_confirmed_on
		)
		order by lr.confirmations desc, lr.rule
	) as laptop_rules
	from public.place_laptop_rules lr
	where lr.place_id = p.id
		and lr.rule <> 'none'
		and lr.confirmations * 2 >= (
			select count(*) from public.contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		)
) r on true
where p.review_status = 'approved' and (p.osm_missing_since is null or p.level <> 'osm_only');

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

grant select on public.place_details to anon, authenticated;
