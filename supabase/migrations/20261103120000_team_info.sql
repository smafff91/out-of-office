-- Team info on picked places (feature 8b): what the team checked from public sources when it
-- picked a place. Shown on certified places only, attribute by attribute, until the community
-- answers the same attribute ("From our team · Oct 2026"). Not a contribution: it never enters
-- scores, thresholds, revocation, "Shared by", Founding contributors or user counts (none of
-- those read this table). The public views expose only values and the month.

-- ---------------------------------------------------------------------------
-- Table (private: no grants, written through set_place_team_info)
-- ---------------------------------------------------------------------------

create table public.place_team_info (
	place_id uuid primary key references public.places (id) on delete cascade,
	-- 'available': the sources say there is Wi-Fi, not how fast (team only, shown as "Available").
	wifi text check (wifi in ('fast', 'slow', 'available')),
	outlets public.outlets_level,
	noise public.noise_level,
	long_stays public.long_stays,
	-- Null: not known. Only the rules a source can state ("no laptops at lunch / at weekends").
	laptop_rules public.laptop_rule[]
		check (
			laptop_rules is null
			or (cardinality(laptop_rules) > 0
				and laptop_rules <@ array['no_laptops_lunch', 'no_laptops_weekends']::public.laptop_rule[])
		),
	-- Null: none known (a missing chip is not a "no").
	extras public.place_extra[] check (extras is null or cardinality(extras) > 0),
	note text check (char_length(note) between 1 and 140),
	-- First day of the month the team checked the sources.
	checked_month date not null check (checked_month = date_trunc('month', checked_month)::date),
	updated_at timestamptz not null default now()
);

alter table public.place_team_info enable row level security;
revoke all on public.place_team_info from anon, authenticated;

-- Saves the team info of a place (secret key or admin). p_info: { wifi, outlets, noise,
-- long_stays, laptop_rules: [no_laptops_lunch|no_laptops_weekends], extras: [...], note },
-- every field optional (null or missing = not known; empty lists = not known). p_month: any day
-- of the month the sources were checked, not in the future. Returns created, updated or
-- unchanged. Errors: not_allowed, place_not_found, invalid_team_info, month_in_future.
create function public.set_place_team_info(p_place_id uuid, p_info jsonb, p_month date)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_timezone text;
	v_new public.place_team_info;
	v_old public.place_team_info;
	v_note text := nullif(btrim(coalesce(p_info ->> 'note', '')), '');
begin
	perform public.require_certification_actor();
	select ci.timezone into v_timezone
	from public.places p
	join public.cities ci on ci.id = p.city_id
	where p.id = p_place_id;
	if not found then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	if p_month is null or jsonb_typeof(coalesce(p_info, '{}'::jsonb)) <> 'object' then
		raise exception 'invalid_team_info' using errcode = '22023';
	end if;
	if date_trunc('month', p_month) > date_trunc('month', now() at time zone v_timezone) then
		raise exception 'month_in_future' using errcode = '22023';
	end if;

	begin
		v_new := row(
			p_place_id,
			nullif(p_info ->> 'wifi', ''),
			nullif(p_info ->> 'outlets', '')::public.outlets_level,
			nullif(p_info ->> 'noise', '')::public.noise_level,
			nullif(p_info ->> 'long_stays', '')::public.long_stays,
			nullif(
				array(
					select distinct r::public.laptop_rule
					from jsonb_array_elements_text(coalesce(p_info -> 'laptop_rules', '[]'::jsonb)) r
					order by 1
				),
				'{}'
			),
			nullif(
				array(
					select distinct e::public.place_extra
					from jsonb_array_elements_text(coalesce(p_info -> 'extras', '[]'::jsonb)) e
					order by 1
				),
				'{}'
			),
			v_note,
			date_trunc('month', p_month)::date,
			now()
		)::public.place_team_info;
	exception
		when invalid_text_representation or invalid_parameter_value or wrong_object_type then
			raise exception 'invalid_team_info' using errcode = '22023';
	end;

	select * into v_old from public.place_team_info t where t.place_id = p_place_id for update;
	if found
		and (v_old.wifi, v_old.outlets, v_old.noise, v_old.long_stays, v_old.laptop_rules,
			v_old.extras, v_old.note, v_old.checked_month)
		is not distinct from
		(v_new.wifi, v_new.outlets, v_new.noise, v_new.long_stays, v_new.laptop_rules,
			v_new.extras, v_new.note, v_new.checked_month)
	then
		return 'unchanged';
	end if;

	begin
		insert into public.place_team_info values (v_new.*)
		on conflict (place_id) do update set
			wifi = excluded.wifi,
			outlets = excluded.outlets,
			noise = excluded.noise,
			long_stays = excluded.long_stays,
			laptop_rules = excluded.laptop_rules,
			extras = excluded.extras,
			note = excluded.note,
			checked_month = excluded.checked_month,
			updated_at = excluded.updated_at;
	exception
		when check_violation then
			raise exception 'invalid_team_info' using errcode = '22023';
	end;
	return case when v_old.place_id is null then 'created' else 'updated' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- pick_place with the month of the pick
-- ---------------------------------------------------------------------------

-- Same as 20261031130000_certification_lock.sql, plus p_picked_on: when given (a bulk pick from
-- a file checked earlier), certified_at is the first day of that month in the city's timezone,
-- so the badge shows the month the sources were checked. The row of place_level_changes keeps
-- the real time of the command (created_at = now()). Errors as before, plus month_in_future.
drop function public.pick_place(uuid, text);

create function public.pick_place(p_place_id uuid, p_note text, p_picked_on date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_actor text := public.require_certification_actor();
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_place public.places;
	v_timezone text;
	v_certified_at timestamptz := now();
	v_revocation jsonb;
	v_level public.place_level;
begin
	if v_note is null then
		raise exception 'note_required' using errcode = '22023';
	end if;
	select * into v_place from public.places p where p.id = p_place_id for no key update;
	if not found or v_place.review_status <> 'approved' then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	if p_picked_on is not null then
		select ci.timezone into v_timezone from public.cities ci where ci.id = v_place.city_id;
		if date_trunc('month', p_picked_on) > date_trunc('month', now() at time zone v_timezone) then
			raise exception 'month_in_future' using errcode = '22023';
		end if;
		v_certified_at := date_trunc('month', p_picked_on)::timestamp at time zone v_timezone;
	end if;
	if v_place.osm_missing_since is not null then
		raise exception 'place_missing_from_osm' using errcode = 'P0001';
	end if;
	if v_place.level = 'certified' and v_place.cert_origin = 'confirmed' then
		raise exception 'already_confirmed' using errcode = 'P0001';
	end if;
	v_revocation := public.revocation_check(p_place_id);
	if v_revocation is not null then
		raise exception 'would_be_revoked' using errcode = 'P0001', detail = v_revocation::text;
	end if;

	update public.places
	set
		level = 'certified',
		cert_origin = 'picked',
		certified_at = v_certified_at,
		revoked_at = null,
		revoked_notice = false,
		auto_cert_blocked = false
	where id = p_place_id;
	perform public.log_level_change(
		v_place, 'picked', case when v_place.level = 'certified' then 'renewed' end, v_actor, v_note
	);
	if v_place.auto_cert_blocked then
		perform public.log_level_change(
			(select p from public.places p where p.id = p_place_id), 'unblocked', 'picked', v_actor
		);
	end if;

	v_level := public.recompute_place_certification(p_place_id);
	return jsonb_build_object(
		'level', v_level,
		'origin', (select p.cert_origin from public.places p where p.id = p_place_id),
		'renewed', v_place.level = 'certified',
		'unblocked', v_place.auto_cert_blocked
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public views: team values where the community has not answered, certified places only
-- ---------------------------------------------------------------------------

-- Same as 20261031120000_certification.sql, plus from_team at the end: the team note of a
-- certified place, dated by its month like the others.
create or replace view public.place_notes as
select
	c.place_id,
	c.note,
	to_char(c.created_at at time zone ci.timezone, 'YYYY-MM') as created_month,
	false as from_team
from public.counted_contributions c
join public.places p on p.id = c.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
where c.note is not null and c.note <> ''
union all
select
	t.place_id,
	t.note,
	to_char(t.checked_month, 'YYYY-MM'),
	true
from public.place_team_info t
join public.places p on p.id = t.place_id and p.review_status = 'approved' and p.level = 'certified'
where t.note is not null;

-- Same as 20261031120000_certification.sql. Wi-Fi, outlets and noise fall back on the team's
-- values (a contribution answers all four main attributes, so they never mix), and the laptop
-- rules on the team's until a counted contribution answers the question. Certified places only.
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
	coalesce(a.wifi, t.wifi) as wifi,
	coalesce(a.outlets, t.outlets::text) as outlets,
	coalesce(a.noise, t.noise::text) as noise,
	case
		when exists (
			select 1 from public.counted_contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		) then r.laptop_rules
		else (select array_agg(tr::text order by tr) from unnest(t.laptop_rules) tr)
	end as laptop_rules,
	p.lng,
	p.lat,
	p.amenity,
	cv.cover_path
from public.places p
join public.cities ci on ci.id = p.city_id
left join public.neighborhoods n on n.id = p.neighborhood_id
left join public.place_scores s on s.place_id = p.id
left join public.place_team_info t on t.place_id = p.id and p.level = 'certified'
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
			select count(*) from public.counted_contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		)
) r on true
-- Cover: the thumbnail of the latest visible photo (a chosen cover can come first in feature 9).
left join lateral (
	select v.storage_path as cover_path
	from public.visible_photos v
	where v.place_id = p.id
	order by v.published_at desc, v.id
	limit 1
) cv on true
where p.review_status = 'approved' and (p.osm_missing_since is null or p.level <> 'osm_only');

-- Same as 20261031120000_certification.sql. Every entry of attributes, laptop_rules and extras
-- now says where it comes from: "source": "users" (with confirmations and last_confirmed_on) or
-- "source": "team" (with "month": "YYYY-MM"), team entries on certified places only:
-- - attributes: the team's value for each attribute no counted contribution answers;
-- - laptop_rules: the team's rules while no counted contribution answers the question;
-- - extras: each team chip no counted contribution mentions, after the community's.
create or replace view public.place_details as
select
	p.city_id,
	p.slug,
	p.name,
	p.amenity,
	p.level,
	-- Shown only for certified places ("Picked by our team" / "Confirmed by N users").
	case when p.level = 'certified' then p.cert_origin end as cert_origin,
	case when p.level = 'certified' then date_trunc('month', p.certified_at at time zone ci.timezone)::date end
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
	-- The community's value wins (right side of ||).
	coalesce(ta.attributes, '{}'::jsonb) || coalesce(a.attributes, '{}'::jsonb) as attributes,
	case
		when exists (
			select 1 from public.counted_contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		) then coalesce(r.laptop_rules, '[]'::jsonb)
		else coalesce(tr.laptop_rules, '[]'::jsonb)
	end as laptop_rules,
	p.id,
	coalesce(x.extras, '[]'::jsonb) || coalesce(tx.extras, '[]'::jsonb) as extras,
	st.checkin_radius_m,
	st.checkin_max_accuracy_m,
	coalesce(ph.paths, '{}') as photo_paths,
	coalesce(ph.count, 0) as photo_count,
	case
		when p.level <> 'certified' and p.revoked_notice
			and p.revoked_at > now() - make_interval(days => st.removed_notice_days)
		then date_trunc('month', p.revoked_at at time zone ci.timezone)::date
	end as removed_on,
	not p.auto_cert_blocked as can_get_certified
from public.places p
join public.cities ci on ci.id = p.city_id
cross join lateral public.city_settings(p.city_id) st
left join public.neighborhoods n on n.id = p.neighborhood_id
left join public.neighborhoods d on d.id = n.parent_id
left join public.place_scores s on s.place_id = p.id
left join public.place_team_info t on t.place_id = p.id and p.level = 'certified'
left join lateral (
	select count(distinct coalesce(c.user_id, c.anon_key))::integer as contributors
	from public.counted_contributions c
	where c.place_id = p.id
) u on true
-- { "wifi": { "value": "fast", "confirmations": 4, "last_confirmed_on": "2026-10-14", "source": "users" }, … }
left join lateral (
	select jsonb_object_agg(
		pa.attribute,
		jsonb_build_object(
			'value', pa.value,
			'confirmations', pa.confirmations,
			'last_confirmed_on', pa.last_confirmed_on,
			'source', 'users'
		)
	) as attributes
	from public.place_attributes pa
	where pa.place_id = p.id
) a on true
-- { "wifi": { "value": "available", "source": "team", "month": "2026-10" }, … }
left join lateral (
	select jsonb_object_agg(
		tv.attribute,
		jsonb_build_object('value', tv.value, 'source', 'team', 'month', to_char(t.checked_month, 'YYYY-MM'))
	) as attributes
	from (
		values
			('wifi', t.wifi),
			('outlets', t.outlets::text),
			('noise', t.noise::text),
			('long_stays', t.long_stays::text)
	) tv (attribute, value)
	where tv.value is not null
) ta on true
-- Laptop rules confirmed by at least half of the people who answered the question
-- (same rule as place_list_items); the time limit carries its most frequent hours.
left join lateral (
	select jsonb_agg(
		jsonb_build_object(
			'rule', lr.rule,
			'confirmations', lr.confirmations,
			'last_confirmed_on', lr.last_confirmed_on,
			'source', 'users'
		)
		|| case
			when lr.rule = 'time_limit' and h.hours is not null then jsonb_build_object('hours', h.hours)
			else '{}'::jsonb
		end
		order by lr.confirmations desc, lr.rule
	) as laptop_rules
	from public.place_laptop_rules lr
	left join lateral (
		select mode() within group (order by c.time_limit_hours) as hours
		from public.counted_contributions c
		where c.place_id = p.id and c.time_limit_hours is not null
	) h on true
	where lr.place_id = p.id
		and lr.rule <> 'none'
		and lr.confirmations * 2 >= (
			select count(*) from public.counted_contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		)
) r on true
left join lateral (
	select jsonb_agg(
		jsonb_build_object('rule', tl.rule, 'source', 'team', 'month', to_char(t.checked_month, 'YYYY-MM'))
		order by tl.rule
	) as laptop_rules
	from unnest(t.laptop_rules) tl (rule)
) tr on true
-- [{ "extra": "toilet", "confirmations": 3, "last_confirmed_on": "2026-10-14", "source": "users" }, …]
left join lateral (
	select jsonb_agg(
		jsonb_build_object(
			'extra', e.extra,
			'confirmations', e.confirmations,
			'last_confirmed_on', e.last_confirmed_on,
			'source', 'users'
		)
		order by e.confirmations desc, e.extra
	) as extras
	from (
		select
			x.extra,
			count(*)::integer as confirmations,
			(max(c.created_at) at time zone ci.timezone)::date as last_confirmed_on
		from public.counted_contributions c
		cross join lateral unnest(c.extras) as x(extra)
		where c.place_id = p.id
		group by x.extra
	) e
) x on true
left join lateral (
	select jsonb_agg(
		jsonb_build_object('extra', te.extra, 'source', 'team', 'month', to_char(t.checked_month, 'YYYY-MM'))
		order by te.extra
	) as extras
	from unnest(t.extras) te (extra)
	where not exists (
		select 1 from public.counted_contributions c
		where c.place_id = p.id and te.extra = any (c.extras)
	)
) tx on true
-- The three latest visible photos for the preview strip, and how many the gallery shows ("+N").
-- No names here: credits come only from place_photos.
left join lateral (
	select
		(array_agg(v.storage_path order by v.published_at desc, v.id))[1:3] as paths,
		least(count(*), 12)::integer as count
	from public.visible_photos v
	where v.place_id = p.id
) ph on true
where p.review_status = 'approved' and (p.osm_missing_since is null or p.level <> 'osm_only');

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

-- Views replaced in place keep their grants; functions: Postgres grants EXECUTE to PUBLIC.
revoke execute on function
	public.set_place_team_info(uuid, jsonb, date),
	public.pick_place(uuid, text, date)
	from public, anon, authenticated;
-- Both check the caller themselves (require_certification_actor): the secret key or an admin.
grant execute on function
	public.set_place_team_info(uuid, jsonb, date),
	public.pick_place(uuid, text, date)
	to authenticated, service_role;
