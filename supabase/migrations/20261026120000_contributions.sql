-- Contribution form and check-in (feature 7b):
-- - contributions keep their history: a new contribution supersedes the author's previous one
--   for the same place (superseded_at / superseded_by) instead of deleting it. Exactly one active
--   contribution per user and place; every public view counts active contributions only.
-- - city_id on every contribution (set by a trigger from the place) and checked_in (= verified)
--   stay as history, so per-city counts such as the future "Regular" level need no new schema.
-- - The check-in distance is no longer stored: only the verified boolean.
-- - submit_contribution(): the only way to add a contribution. Signed-in accounts with a
--   confirmed email, 20 per day, check-in verified here with PostGIS (the coordinates arrive in
--   the POST body, are compared and forgotten), the place moves from osm_only to community, and
--   the first users of each city get the Founding contributor badge.
-- - founding_contributors: numbered seats per city (never more than the city's limit, even
--   with simultaneous submissions). Replaces profiles.founding_contributor (one per city now).
-- - my_recent_contribution(): the user's own answers of the last 30 days, to prefill the form.
-- - Clients can no longer read or write the contributions table directly.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.certification_settings
	add column checkin_max_accuracy_m integer not null default 100 check (checkin_max_accuracy_m > 0),
	add column daily_contribution_limit integer not null default 20 check (daily_contribution_limit > 0),
	add column founding_limit integer not null default 50 check (founding_limit >= 0);

-- The city's own row, else the default row (city_id null).
create function public.city_settings(p_city_id uuid)
returns public.certification_settings
language sql
stable
set search_path = ''
as $$
	select s.*
	from public.certification_settings s
	where s.city_id = p_city_id or s.city_id is null
	order by s.city_id nulls last
	limit 1;
$$;

-- ---------------------------------------------------------------------------
-- contributions: history instead of deletion
-- ---------------------------------------------------------------------------

alter table public.contributions
	add column city_id uuid references public.cities (id),
	add column superseded_at timestamptz,
	add column superseded_by uuid references public.contributions (id) on delete set null,
	add column time_limit_hours smallint check (time_limit_hours in (1, 2, 3)),
	drop column checkin_distance_m;

update public.contributions c set city_id = p.city_id from public.places p where p.id = c.place_id;

alter table public.contributions
	alter column city_id set not null,
	add constraint contributions_time_limit_check
		check (time_limit_hours is null or 'time_limit' = any (laptop_rules));

-- One active contribution per user and place (also the guard against simultaneous submissions).
create unique index contributions_one_active_idx
	on public.contributions (user_id, place_id)
	where user_id is not null and superseded_at is null;
create index contributions_user_created_idx on public.contributions (user_id, created_at);
create index contributions_active_place_idx
	on public.contributions (place_id)
	where superseded_at is null;

-- The city always comes from the place, whoever inserts.
create function public.set_contribution_city()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	select p.city_id into new.city_id from public.places p where p.id = new.place_id;
	return new;
end;
$$;

create trigger contributions_c_set_city
	before insert on public.contributions
	for each row execute function public.set_contribution_city();

-- The old trigger deleted the previous contribution: submit_contribution() supersedes it now.
drop trigger contributions_b_replace_recent on public.contributions;
drop function public.replace_recent_contribution();

-- Second barrier: the API has no write grants on contributions any more.
create or replace function public.protect_contribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if public.is_api_caller() then
		new.user_id := auth.uid();
		new.anon_key := null;
		new.checked_in := false;
		new.superseded_at := null;
		new.superseded_by := null;
		new.created_at := now();
	end if;
	return new;
end;
$$;

-- Clients neither read nor write raw contributions: only through the public views and the
-- functions below. RLS stays on with no policy for them.
drop policy "Users read their own contributions" on public.contributions;
drop policy "Users add their own contributions" on public.contributions;
drop policy "Users delete their own contributions" on public.contributions;
revoke select, insert, update, delete on public.contributions from anon, authenticated;

-- Active contributions only. Internal: no grants; the public views (owner rights) read it.
create view public.active_contributions as
select *
from public.contributions
where superseded_at is null;

-- ---------------------------------------------------------------------------
-- Founding contributor: numbered seats per city
-- ---------------------------------------------------------------------------

create table public.founding_contributors (
	city_id uuid not null references public.cities (id) on delete cascade,
	seat integer not null check (seat > 0),
	-- The seat stays taken when the account is deleted.
	user_id uuid references public.profiles (id) on delete set null,
	awarded_at timestamptz not null default now(),
	primary key (city_id, seat),
	unique (city_id, user_id)
);

alter table public.founding_contributors enable row level security;

-- One badge per city now: the table is the only source.
alter table public.profiles drop column founding_contributor;

create or replace function public.protect_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if public.is_api_caller() and not public.is_admin() then
		new.id := old.id;
		new.role := old.role;
		new.created_at := old.created_at;
	end if;
	return new;
end;
$$;

-- Development and pre-launch tests: frees every seat of a city. service_role only.
create function public.reset_founding_contributors(p_city_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_count integer;
begin
	delete from public.founding_contributors where city_id = p_city_id;
	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public views: active contributions only (same columns, appended ones at the end)
-- ---------------------------------------------------------------------------

create or replace view public.place_scores as
select
	c.place_id,
	count(*)::integer as votes,
	(count(*) filter (where c.would_work_again))::integer as yes_votes,
	round(100.0 * count(*) filter (where c.would_work_again) / count(*))::integer as score_pct
from public.active_contributions c
join public.places p on p.id = c.place_id and p.review_status = 'approved'
group by c.place_id;

create or replace view public.place_attributes as
with answers as (
	select place_id, created_at, 'wifi' as attribute, wifi::text as value from public.active_contributions
	union all
	select place_id, created_at, 'outlets', outlets::text from public.active_contributions
	union all
	select place_id, created_at, 'noise', noise::text from public.active_contributions
	union all
	select place_id, created_at, 'long_stays', long_stays::text from public.active_contributions
),
counted as (
	select
		place_id,
		attribute,
		value,
		count(*)::integer as confirmations,
		max(created_at) as last_confirmed_at,
		row_number() over (
			partition by place_id, attribute
			order by count(*) desc, max(created_at) desc
		) as rank
	from answers
	group by place_id, attribute, value
)
select
	k.place_id,
	k.attribute,
	k.value,
	k.confirmations,
	(k.last_confirmed_at at time zone ci.timezone)::date as last_confirmed_on
from counted k
join public.places p on p.id = k.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
where k.rank = 1;

create or replace view public.place_laptop_rules as
select
	r.place_id,
	r.rule,
	count(*)::integer as confirmations,
	(max(r.created_at) at time zone ci.timezone)::date as last_confirmed_on
from (
	select place_id, created_at, unnest(laptop_rules) as rule
	from public.active_contributions
	where laptop_rules is not null
) r
join public.places p on p.id = r.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
group by r.place_id, r.rule, ci.timezone;

create or replace view public.place_notes as
select
	c.place_id,
	c.note,
	to_char(c.created_at at time zone ci.timezone, 'YYYY-MM') as created_month
from public.active_contributions c
join public.places p on p.id = c.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
where c.note is not null and c.note <> '';

create or replace view public.place_contributors as
select distinct
	c.place_id,
	pr.display_name
from public.active_contributions c
join public.profiles pr on pr.id = c.user_id
join public.places p on p.id = c.place_id and p.review_status = 'approved'
where pr.show_name is true and pr.display_name is not null
order by c.place_id, pr.display_name;

-- Same as 20261012140000_place_amenity.sql, active contributions in the laptop rules quorum.
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
			select count(*) from public.active_contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		)
) r on true
where p.review_status = 'approved' and (p.osm_missing_since is null or p.level <> 'osm_only');

-- Same as 20261017120000_place_details.sql, active contributions only, plus at the end:
-- - id: the contribution form sends it;
-- - extras: every detail at least one active contribution mentions, with confirmations and the
--   last day. Not choosing a detail is not a "no", so there is no quorum;
-- - hours of the time limit (most frequent answer) inside the time_limit laptop rule;
-- - the check-in thresholds, only to show the distance in the form (the database decides).
create or replace view public.place_details as
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
	coalesce(r.laptop_rules, '[]'::jsonb) as laptop_rules,
	p.id,
	coalesce(x.extras, '[]'::jsonb) as extras,
	st.checkin_radius_m,
	st.checkin_max_accuracy_m
from public.places p
join public.cities ci on ci.id = p.city_id
cross join lateral public.city_settings(p.city_id) st
left join public.neighborhoods n on n.id = p.neighborhood_id
left join public.neighborhoods d on d.id = n.parent_id
left join public.place_scores s on s.place_id = p.id
left join lateral (
	select count(distinct coalesce(c.user_id, c.anon_key))::integer as contributors
	from public.active_contributions c
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
-- (same rule as place_list_items); the time limit carries its most frequent hours.
left join lateral (
	select jsonb_agg(
		jsonb_build_object(
			'rule', lr.rule,
			'confirmations', lr.confirmations,
			'last_confirmed_on', lr.last_confirmed_on
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
		from public.active_contributions c
		where c.place_id = p.id and c.time_limit_hours is not null
	) h on true
	where lr.place_id = p.id
		and lr.rule <> 'none'
		and lr.confirmations * 2 >= (
			select count(*) from public.active_contributions c
			where c.place_id = p.id and c.laptop_rules is not null
		)
) r on true
-- [{ "extra": "toilet", "confirmations": 3, "last_confirmed_on": "2026-10-14" }, …]
left join lateral (
	select jsonb_agg(
		jsonb_build_object(
			'extra', e.extra,
			'confirmations', e.confirmations,
			'last_confirmed_on', e.last_confirmed_on
		)
		order by e.confirmations desc, e.extra
	) as extras
	from (
		select
			x.extra,
			count(*)::integer as confirmations,
			(max(c.created_at) at time zone ci.timezone)::date as last_confirmed_on
		from public.active_contributions c
		cross join lateral unnest(c.extras) as x(extra)
		where c.place_id = p.id
		group by x.extra
	) e
) x on true
where p.review_status = 'approved' and (p.osm_missing_since is null or p.level <> 'osm_only');

-- ---------------------------------------------------------------------------
-- submit_contribution(): the only way in
-- ---------------------------------------------------------------------------

-- Errors are raised with a stable message the app maps to its texts:
--   not_signed_in, email_not_confirmed, place_not_found, daily_limit, invalid_laptop_rules,
--   note_too_long.
-- The coordinates are never stored and never appear in an error message.
create function public.submit_contribution(
	p_place_id uuid,
	p_would_work_again boolean,
	p_wifi public.wifi_level,
	p_outlets public.outlets_level,
	p_noise public.noise_level,
	p_long_stays public.long_stays,
	p_laptop_rules public.laptop_rule[] default null,
	p_time_limit_hours smallint default null,
	p_extras public.place_extra[] default null,
	p_note text default null,
	p_lat double precision default null,
	p_lng double precision default null,
	p_accuracy double precision default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_user uuid := auth.uid();
	v_place public.places;
	v_settings public.certification_settings;
	v_rules public.laptop_rule[];
	v_extras public.place_extra[];
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_hours smallint;
	v_verified boolean := false;
	v_previous public.contributions;
	v_replaced boolean := false;
	v_id uuid;
	v_founding boolean := false;
	v_seats integer;
	v_level public.place_level;
begin
	-- Coordinates travel only in a POST body, never in a URL that could be logged.
	if current_setting('request.method', true) = 'GET' then
		raise exception 'submit_contribution accepts only POST requests' using errcode = '42501';
	end if;

	if v_user is null then
		raise exception 'not_signed_in' using errcode = '42501';
	end if;

	if not exists (
		select 1 from auth.users u where u.id = v_user and u.email_confirmed_at is not null
	) then
		raise exception 'email_not_confirmed' using errcode = 'P0001';
	end if;

	select * into v_place
	from public.places p
	where p.id = p_place_id
		and p.review_status = 'approved'
		and (p.osm_missing_since is null or p.level <> 'osm_only');
	if not found then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;

	v_settings := public.city_settings(v_place.city_id);

	-- One submission at a time per user: the daily limit and the replacement stay exact.
	perform pg_advisory_xact_lock(hashtextextended('contribution:' || v_user::text, 0));

	if (
		select count(*) from public.contributions c
		where c.user_id = v_user and c.created_at > now() - interval '24 hours'
	) >= v_settings.daily_contribution_limit then
		raise exception 'daily_limit' using errcode = 'P0001';
	end if;

	-- Laptop rules: no duplicates, "none" (No rules) only on its own, empty = not answered.
	select array_agg(distinct r) into v_rules from unnest(p_laptop_rules) as r;
	if 'none' = any (v_rules) and cardinality(v_rules) > 1 then
		raise exception 'invalid_laptop_rules' using errcode = '22023';
	end if;
	if 'time_limit' = any (v_rules) then
		v_hours := p_time_limit_hours;
	end if;
	select coalesce(array_agg(distinct e), '{}') into v_extras from unnest(p_extras) as e;
	if char_length(v_note) > 140 then
		raise exception 'note_too_long' using errcode = '22023';
	end if;

	-- Verified check-in: a valid position within the radius, with a declared accuracy within
	-- the limit. Anything missing or invalid simply means "not verified".
	if p_lat is not null and p_lng is not null and p_accuracy is not null
		and p_lat <> 'NaN' and p_lng <> 'NaN' and p_accuracy <> 'NaN'
		and p_lat between -90 and 90 and p_lng between -180 and 180
		and p_accuracy >= 0 and p_accuracy <= v_settings.checkin_max_accuracy_m then
		v_verified := extensions.st_dwithin(
			v_place.geom::extensions.geography,
			extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
			v_settings.checkin_radius_m
		);
	end if;

	-- The previous active contribution goes to the history (superseded), whatever its age.
	select * into v_previous
	from public.contributions c
	where c.user_id = v_user and c.place_id = v_place.id and c.superseded_at is null
	for update;
	if found then
		v_replaced := v_previous.created_at > now() - make_interval(days => v_settings.vote_cooldown_days);
		update public.contributions set superseded_at = now() where id = v_previous.id;
	end if;

	insert into public.contributions (
		place_id, user_id, would_work_again, wifi, outlets, noise, long_stays,
		laptop_rules, time_limit_hours, extras, note, checked_in
	)
	values (
		v_place.id, v_user, p_would_work_again, p_wifi, p_outlets, p_noise, p_long_stays,
		v_rules, v_hours, v_extras, v_note, v_verified
	)
	returning id into v_id;

	if v_previous.id is not null then
		update public.contributions set superseded_by = v_id where id = v_previous.id;
	end if;

	-- At least one contribution: community info (certification is feature 8).
	update public.places set level = 'community' where id = v_place.id and level = 'osm_only';
	select p.level into v_level from public.places p where p.id = v_place.id;

	-- Founding contributor: on the user's first contribution in the city, while seats are left.
	-- The lock serializes the city's submissions; the primary key and the unique constraint
	-- forbid a second holder of a seat and a second seat for the same user anyway.
	if not exists (
		select 1 from public.contributions c
		where c.user_id = v_user and c.city_id = v_place.city_id and c.id <> v_id
	) then
		perform pg_advisory_xact_lock(hashtextextended('founding:' || v_place.city_id::text, 0));
		select count(*) into v_seats from public.founding_contributors f where f.city_id = v_place.city_id;
		if v_seats < v_settings.founding_limit then
			insert into public.founding_contributors (city_id, seat, user_id)
			values (v_place.city_id, v_seats + 1, v_user)
			on conflict do nothing;
			v_founding := found;
		end if;
	end if;

	return jsonb_build_object(
		'verified', v_verified,
		'replaced', v_replaced,
		'founding', v_founding,
		'founding_limit', v_settings.founding_limit,
		'level', v_level,
		-- How many active answers match the user's, per attribute ("5 confirm · just now").
		'confirmations', (
			select jsonb_build_object(
				'wifi', count(*) filter (where c.wifi = p_wifi),
				'outlets', count(*) filter (where c.outlets = p_outlets),
				'noise', count(*) filter (where c.noise = p_noise),
				'long_stays', count(*) filter (where c.long_stays = p_long_stays)
			)
			from public.active_contributions c
			where c.place_id = v_place.id
		),
		'contributors', (
			select count(distinct coalesce(c.user_id, c.anon_key))
			from public.active_contributions c
			where c.place_id = v_place.id
		),
		'min_users', v_settings.min_users
	);
end;
$$;

-- The signed-in user's own active answers for a place, if they are less than 30 days old.
create function public.my_recent_contribution(p_place_id uuid)
returns table (
	would_work_again boolean,
	wifi public.wifi_level,
	outlets public.outlets_level,
	noise public.noise_level,
	long_stays public.long_stays,
	laptop_rules public.laptop_rule[],
	time_limit_hours smallint,
	extras public.place_extra[],
	note text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		c.would_work_again, c.wifi, c.outlets, c.noise, c.long_stays,
		c.laptop_rules, c.time_limit_hours, c.extras, c.note
	from public.contributions c
	where c.user_id = auth.uid()
		and c.place_id = p_place_id
		and c.superseded_at is null
		and c.created_at > now() - make_interval(
			days => (public.city_settings(c.city_id)).vote_cooldown_days
		);
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

grant select on public.place_scores, public.place_attributes, public.place_laptop_rules,
	public.place_notes, public.place_contributors, public.place_list_items, public.place_details
	to anon, authenticated;

-- Functions: Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function
	public.city_settings(uuid),
	public.set_contribution_city(),
	public.protect_contribution(),
	public.protect_profile(),
	public.reset_founding_contributors(uuid),
	public.submit_contribution(
		uuid, boolean, public.wifi_level, public.outlets_level, public.noise_level,
		public.long_stays, public.laptop_rule[], smallint, public.place_extra[], text,
		double precision, double precision, double precision
	),
	public.my_recent_contribution(uuid)
	from public, anon, authenticated;
grant execute on function
	public.submit_contribution(
		uuid, boolean, public.wifi_level, public.outlets_level, public.noise_level,
		public.long_stays, public.laptop_rule[], smallint, public.place_extra[], text,
		double precision, double precision, double precision
	),
	public.my_recent_contribution(uuid)
	to authenticated;
grant execute on function public.reset_founding_contributors(uuid) to service_role;
