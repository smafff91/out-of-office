-- Certification (feature 8), as in docs/certificazione.md (v3.1):
-- - Two origins of the same badge: picked ("Picked by our team", chosen by the team from the
--   terminal or, later, the admin pages) and confirmed ("Confirmed by N users", automatic).
-- - counted_contributions: the one definition of the contributions that count everywhere
--   (score, attributes, contributors, certification): active, from an account with a confirmed
--   email or from a deleted account (it had to be confirmed to send them).
-- - certification_check() / revocation_check(): every condition of the automatic certification
--   and of the revocation, thresholds from certification_settings. Photos never count.
-- - recompute_place_certification(): run by submit_contribution() in the same transaction and
--   by a daily pg_cron job (conditions that depend on time). Every change of level is saved in
--   place_level_changes (private: read only through the functions below).
-- - pick_place() / unpick_place() / unblock_place() and the read functions: `npm run certify`
--   with the secret key (service_role) or, later, an admin (feature 9), nobody else.
-- - Blocked places (auto_cert_blocked) never get the automatic certification, until a new pick
--   or an unblock.
-- - "Certification removed in {month}" on the place page for removed_notice_days.
-- - cities.certified_filter_default: the "Certified for remote work" filter starts on.
-- - The exact certification and revocation dates are no longer readable by the API: the public
--   views expose only the month, the origin and the number of users.

-- ---------------------------------------------------------------------------
-- Origins and settings
-- ---------------------------------------------------------------------------

alter type public.cert_origin rename value 'manual' to 'picked';
alter type public.cert_origin rename value 'community' to 'confirmed';

alter table public.certification_settings
	-- Revocation: in the last revoke_recent_days, with at least revoke_recent_min contributions,
	-- a majority saying Wi-Fi "None" or "Long stays: Not really".
	add column revoke_recent_days integer not null default 90 check (revoke_recent_days > 0),
	add column revoke_recent_min integer not null default 3 check (revoke_recent_min > 0),
	-- How long the place page shows "Certification removed in {month}".
	add column removed_notice_days integer not null default 90 check (removed_notice_days >= 0),
	-- Open during the day on weekdays: daytime_min_hours between daytime_from_hour and
	-- daytime_to_hour on at least daytime_min_weekdays weekdays.
	add column daytime_from_hour smallint not null default 8 check (daytime_from_hour between 0 and 23),
	add column daytime_to_hour smallint not null default 18 check (daytime_to_hour between 1 and 24),
	add column daytime_min_hours numeric(4, 2) not null default 4 check (daytime_min_hours > 0),
	add column daytime_min_weekdays smallint not null default 3 check (daytime_min_weekdays between 1 and 5),
	add constraint certification_settings_daytime_check check (daytime_from_hour < daytime_to_hour);

-- A display setting of the city, not a threshold: a city row in certification_settings would
-- replace every default threshold.
alter table public.cities add column certified_filter_default boolean not null default false;
update public.cities set certified_filter_default = true where slug = 'barcelona';

alter table public.places
	-- Show "Certification removed in {month}" after the last revocation (unpick --no-notice: no).
	add column revoked_notice boolean not null default false,
	-- No automatic certification until a new pick or an unblock.
	add column auto_cert_blocked boolean not null default false;

-- Same as 20261004181742_initial_schema.sql, plus the new columns.
create or replace function public.protect_place_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if public.is_api_caller() and not public.is_admin() then
		new.added_by := auth.uid();
		new.review_status := 'pending';
		new.osm_type := null;
		new.osm_id := null;
		new.osm_missing_since := null;
		new.level := 'osm_only';
		new.cert_origin := null;
		new.certified_at := null;
		new.revoked_at := null;
		new.revoked_notice := false;
		new.auto_cert_blocked := false;
	end if;
	return new;
end;
$$;

-- The API reads places only through the public views; the certification columns (exact dates,
-- origin kept as history after a revocation, notice, block) are not readable directly.
revoke select on public.places from anon, authenticated;
grant select (
	id, city_id, osm_type, osm_id, slug, name, geom, lat, lng, address, opening_hours, phone,
	website, instagram, internet_access_osm, osm_missing_since, level, added_by, review_status,
	created_at, updated_at, neighborhood_id, amenity
) on public.places to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The contributions that count
-- ---------------------------------------------------------------------------

-- Internal: no grants; the public views (owner rights) and the functions below read it.
create view public.counted_contributions as
select c.*
from public.active_contributions c
where c.user_id is null
	or exists (
		select 1 from auth.users u where u.id = c.user_id and u.email_confirmed_at is not null
	);

revoke all on public.counted_contributions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public views on counted_contributions (same columns, appended ones at the end)
-- ---------------------------------------------------------------------------

create or replace view public.place_scores as
select
	c.place_id,
	count(*)::integer as votes,
	(count(*) filter (where c.would_work_again))::integer as yes_votes,
	round(100.0 * count(*) filter (where c.would_work_again) / count(*))::integer as score_pct
from public.counted_contributions c
join public.places p on p.id = c.place_id and p.review_status = 'approved'
group by c.place_id;

create or replace view public.place_attributes as
with answers as (
	select place_id, created_at, 'wifi' as attribute, wifi::text as value from public.counted_contributions
	union all
	select place_id, created_at, 'outlets', outlets::text from public.counted_contributions
	union all
	select place_id, created_at, 'noise', noise::text from public.counted_contributions
	union all
	select place_id, created_at, 'long_stays', long_stays::text from public.counted_contributions
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
	from public.counted_contributions
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
from public.counted_contributions c
join public.places p on p.id = c.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
where c.note is not null and c.note <> '';

create or replace view public.place_contributors as
select distinct
	c.place_id,
	pr.display_name
from public.counted_contributions c
join public.profiles pr on pr.id = c.user_id
join public.places p on p.id = c.place_id and p.review_status = 'approved'
where pr.show_name is true and pr.display_name is not null
order by c.place_id, pr.display_name;

-- Same as 20261029120000_photos.sql, counted contributions in the laptop rules quorum.
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
	p.amenity,
	cv.cover_path
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

-- Same as 20261029120000_photos.sql, with counted contributions, the certification month only
-- (certified_on is the first day of the month), and at the end removed_on (first day of the
-- month of the last removal, while the notice lasts) and can_get_certified (not blocked).
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
	coalesce(a.attributes, '{}'::jsonb) as attributes,
	coalesce(r.laptop_rules, '[]'::jsonb) as laptop_rules,
	p.id,
	coalesce(x.extras, '[]'::jsonb) as extras,
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
left join lateral (
	select count(distinct coalesce(c.user_id, c.anon_key))::integer as contributors
	from public.counted_contributions c
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
		from public.counted_contributions c
		cross join lateral unnest(c.extras) as x(extra)
		where c.place_id = p.id
		group by x.extra
	) e
) x on true
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

-- Same as 20261025120000_city_languages.sql, plus certified_filter_default at the end.
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
	c.languages,
	c.certified_filter_default
from public.cities c
left join visible_places p on p.city_id = c.id
where c.is_active
group by c.id;

-- The rows nearest to the city center for the server-rendered list; certified ones only when
-- the Certified filter starts on.
drop function public.city_center_places(uuid, integer);
create function public.city_center_places(
	p_city_id uuid,
	p_limit integer default 20,
	p_certified_only boolean default false
)
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
		and (not p_certified_only or i.level = 'certified')
	order by p.geom operator(extensions.<->) c.center
	limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Opening hours: open during the day on weekdays
-- ---------------------------------------------------------------------------

-- The same careful reading as parseOpeningHours() in src/lib/places/opening-hours.ts (checked
-- against the same OSM samples by tests/db/certification.check.ts): seven arrays, Monday first,
-- of [start, end] in minutes (end may pass 1440, after midnight), or null when the text is not
-- one of the shapes read with certainty.
create function public.opening_hours_week(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
	c_days constant text[] := array['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
	c_day constant text := '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
	c_time constant text := '(?:[01][0-9]|2[0-4]):[0-5][0-9]';
	v_day_item text := c_day || '(?:\s*-\s*' || c_day || ')?';
	v_range text := c_time || '\s*-\s*' || c_time;
	v_rule_re text := '^(?:(' || v_day_item || '(?:\s*,\s*' || v_day_item || ')*)\s+)?(off|closed|'
		|| v_range || '(?:\s*,\s*' || v_range || ')*)$';
	v_value text := regexp_replace(coalesce(p_text, ''), '^\s+|\s+$', '', 'g');
	v_week jsonb[] := array_fill('[]'::jsonb, array[7]);
	v_rule text;
	v_match text[];
	v_days integer[];
	v_item text;
	v_from integer;
	v_to integer;
	v_day integer;
	v_intervals jsonb;
	v_range_text text;
	v_start integer;
	v_end integer;
begin
	if v_value = '24/7' then
		return jsonb_build_array(
			'[[0,1440]]'::jsonb, '[[0,1440]]'::jsonb, '[[0,1440]]'::jsonb, '[[0,1440]]'::jsonb,
			'[[0,1440]]'::jsonb, '[[0,1440]]'::jsonb, '[[0,1440]]'::jsonb
		);
	end if;
	if v_value = '' or v_value ~ '["|]' then
		return null;
	end if;

	foreach v_rule in array string_to_array(v_value, ';') loop
		v_rule := regexp_replace(v_rule, '^\s+|\s+$', '', 'g');
		continue when v_rule = '';
		v_match := regexp_match(v_rule, v_rule_re);
		if v_match is null then
			return null;
		end if;

		if v_match[1] is null then
			v_days := array[0, 1, 2, 3, 4, 5, 6];
		else
			v_days := '{}';
			foreach v_item in array string_to_array(v_match[1], ',') loop
				v_from := array_position(c_days, btrim(split_part(v_item, '-', 1))) - 1;
				if position('-' in v_item) = 0 then
					v_days := v_days || v_from;
				else
					-- Ranges may wrap around the week ("Fr-Mo").
					v_to := array_position(c_days, btrim(split_part(v_item, '-', 2))) - 1;
					v_day := v_from;
					loop
						v_days := v_days || v_day;
						exit when v_day = v_to;
						v_day := (v_day + 1) % 7;
					end loop;
				end if;
			end loop;
		end if;

		v_intervals := '[]'::jsonb;
		if v_match[2] not in ('off', 'closed') then
			foreach v_range_text in array string_to_array(v_match[2], ',') loop
				v_start := split_part(btrim(split_part(v_range_text, '-', 1)), ':', 1)::integer * 60
					+ split_part(btrim(split_part(v_range_text, '-', 1)), ':', 2)::integer;
				v_end := split_part(btrim(split_part(v_range_text, '-', 2)), ':', 1)::integer * 60
					+ split_part(btrim(split_part(v_range_text, '-', 2)), ':', 2)::integer;
				if v_start >= 1440 then
					return null;
				end if;
				-- "18:00-02:00" ends after midnight.
				if v_end <= v_start then
					v_end := v_end + 1440;
				end if;
				if v_end = v_start or v_end - v_start > 1440 then
					return null;
				end if;
				v_intervals := v_intervals || jsonb_build_array(jsonb_build_array(v_start, v_end));
			end loop;
		end if;

		-- A later rule replaces earlier ones for the days it names (OSM semantics).
		foreach v_day in array v_days loop
			v_week[v_day + 1] := v_intervals;
		end loop;
	end loop;

	return to_jsonb(v_week);
end;
$$;

-- False when the hours are readable and fewer than p_min_days weekdays (Monday to Friday) are
-- open at least p_min_hours between p_from_hour and p_to_hour (the night before, after
-- midnight, counts too); null when the hours are missing or not readable (never blocks).
create function public.weekday_daytime_ok(
	p_text text,
	p_from_hour integer,
	p_to_hour integer,
	p_min_hours numeric,
	p_min_days integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
	with week as (
		select public.opening_hours_week(p_text) as w
	)
	select case
		when p_text is null or w is null then null
		else (
			select count(*) >= p_min_days
			from generate_series(0, 4) d
			where (
				select count(*)
				from generate_series(p_from_hour * 60, p_to_hour * 60 - 1) m
				where exists (
					select 1 from jsonb_array_elements(w -> d) i
					where m >= (i ->> 0)::integer and m < (i ->> 1)::integer
				)
				or exists (
					select 1 from jsonb_array_elements(w -> ((d + 6) % 7)) i
					where m + 1440 >= (i ->> 0)::integer and m + 1440 < (i ->> 1)::integer
				)
			) >= p_min_hours * 60
		)
	end
	from week;
$$;

-- ---------------------------------------------------------------------------
-- Conditions
-- ---------------------------------------------------------------------------

-- The revocation condition that holds, with its numbers, or null. On the counted contributions
-- of the last revoke_window_months: score below revoke_below_score with at least
-- revoke_min_votes votes; of the last revoke_recent_days (at least revoke_recent_min): more
-- than half say Wi-Fi "None", or more than half say "Long stays: Not really".
create function public.revocation_check(p_place_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_settings public.certification_settings;
	v_votes integer;
	v_yes integer;
	v_recent integer;
	v_wifi_none integer;
	v_not_really integer;
begin
	select (public.city_settings(p.city_id)).* into v_settings
	from public.places p where p.id = p_place_id;
	if not found then
		return null;
	end if;

	select count(*), count(*) filter (where c.would_work_again)
	into v_votes, v_yes
	from public.counted_contributions c
	where c.place_id = p_place_id
		and c.created_at > now() - make_interval(months => v_settings.revoke_window_months);
	if v_votes >= v_settings.revoke_min_votes and v_yes < v_settings.revoke_below_score * v_votes then
		return jsonb_build_object(
			'reason', 'score_below',
			'votes', v_votes,
			'score_pct', round(100.0 * v_yes / v_votes)
		);
	end if;

	select
		count(*),
		count(*) filter (where c.wifi = 'none'),
		count(*) filter (where c.long_stays = 'not_really')
	into v_recent, v_wifi_none, v_not_really
	from public.counted_contributions c
	where c.place_id = p_place_id
		and c.created_at > now() - make_interval(days => v_settings.revoke_recent_days);
	if v_recent >= v_settings.revoke_recent_min then
		if v_wifi_none * 2 > v_recent then
			return jsonb_build_object('reason', 'wifi_none', 'recent', v_recent, 'count', v_wifi_none);
		end if;
		if v_not_really * 2 > v_recent then
			return jsonb_build_object(
				'reason', 'long_stays_not_really', 'recent', v_recent, 'count', v_not_really
			);
		end if;
	end if;
	return null;
end;
$$;

-- Every condition of the automatic certification with its value, the list of the missing
-- ones and meets (all of them). Users: distinct accounts (or deleted-account keys) with a
-- counted contribution; checked in: those of them with a verified check-in at the place in any
-- of their contributions (also superseded ones); span: first to last counted contribution.
create function public.certification_check(p_place_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_place public.places;
	v_settings public.certification_settings;
	v_users integer;
	v_checkin integer;
	v_wifi integer;
	v_welcome integer;
	v_first timestamptz;
	v_last timestamptz;
	v_votes integer;
	v_yes integer;
	v_reports integer;
	v_daytime boolean;
	v_revocation jsonb;
	v_missing text[] := '{}';
begin
	select * into v_place from public.places p where p.id = p_place_id;
	if not found then
		return null;
	end if;
	v_settings := public.city_settings(v_place.city_id);

	select
		count(distinct coalesce(c.user_id, c.anon_key)),
		count(*) filter (where c.wifi in ('slow', 'fast')),
		count(*) filter (where c.long_stays = 'welcome'),
		min(c.created_at),
		max(c.created_at)
	into v_users, v_wifi, v_welcome, v_first, v_last
	from public.counted_contributions c
	where c.place_id = p_place_id;

	select count(distinct coalesce(c.user_id, c.anon_key)) into v_checkin
	from public.counted_contributions c
	where c.place_id = p_place_id
		and exists (
			select 1 from public.contributions h
			where h.place_id = c.place_id
				and h.checked_in
				and coalesce(h.user_id, h.anon_key) = coalesce(c.user_id, c.anon_key)
		);

	-- The score: the one of place_scores.
	select coalesce(s.votes, 0), coalesce(s.yes_votes, 0) into v_votes, v_yes
	from (select 1) one
	left join public.place_scores s on s.place_id = p_place_id;

	-- Open reports block it, except the ones about photos or notes (feature 9 sends them).
	select count(*) into v_reports
	from public.reports r
	where r.place_id = p_place_id and r.status = 'open' and r.reason <> 'inappropriate_content';

	v_daytime := public.weekday_daytime_ok(
		v_place.opening_hours,
		v_settings.daytime_from_hour,
		v_settings.daytime_to_hour,
		v_settings.daytime_min_hours,
		v_settings.daytime_min_weekdays
	);
	v_revocation := public.revocation_check(p_place_id);

	if v_place.review_status <> 'approved' then v_missing := array_append(v_missing, 'approved'); end if;
	if v_users < v_settings.min_users then v_missing := array_append(v_missing, 'users'); end if;
	if v_users = 0 or v_checkin < v_settings.min_checkin_ratio * v_users then
		v_missing := array_append(v_missing, 'checkins');
	end if;
	if v_users = 0 or v_last - v_first < make_interval(days => v_settings.min_span_days) then
		v_missing := array_append(v_missing, 'span');
	end if;
	if v_votes = 0 or v_yes < v_settings.min_score * v_votes then v_missing := array_append(v_missing, 'score'); end if;
	if v_wifi * 2 <= v_users then v_missing := array_append(v_missing, 'wifi'); end if;
	if v_welcome * 2 <= v_users then v_missing := array_append(v_missing, 'long_stays'); end if;
	if v_daytime is false then v_missing := array_append(v_missing, 'daytime'); end if;
	if v_reports > 0 then v_missing := array_append(v_missing, 'reports'); end if;
	if v_revocation is not null then v_missing := array_append(v_missing, 'revocation'); end if;

	return jsonb_build_object(
		'users', v_users,
		'min_users', v_settings.min_users,
		'checkin_users', v_checkin,
		'span_days', coalesce(round(extract(epoch from v_last - v_first) / 86400, 1), 0),
		'votes', v_votes,
		'score_pct', case when v_votes > 0 then round(100.0 * v_yes / v_votes) end,
		'wifi_ok', v_wifi * 2 > v_users,
		'long_stays_ok', v_welcome * 2 > v_users,
		'daytime', v_daytime,
		'open_reports', v_reports,
		'revocation', v_revocation,
		'missing', to_jsonb(v_missing),
		'meets', cardinality(v_missing) = 0
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- Changes of level
-- ---------------------------------------------------------------------------

create type public.level_change_kind as enum (
	'level_up', -- osm_only → community (first contribution)
	'certified', -- automatic certification (confirmed)
	'confirmed', -- a picked place now meets the conditions
	'picked', -- picked, or picked again (renewed)
	'revoked', -- automatic revocation
	'unpicked', -- badge removed by the team
	'blocked',
	'unblocked'
);

-- Private: no grants to anon or authenticated; read through the functions below.
create table public.place_level_changes (
	id bigint generated always as identity primary key,
	place_id uuid not null references public.places (id) on delete cascade,
	city_id uuid not null references public.cities (id) on delete cascade,
	kind public.level_change_kind not null,
	from_level public.place_level not null,
	to_level public.place_level not null,
	from_origin public.cert_origin,
	to_origin public.cert_origin,
	-- A code for automatic changes (conditions_met, score_below, wifi_none,
	-- long_stays_not_really, first_contribution), the team's words otherwise.
	reason text,
	-- Sources checked for a pick.
	note text,
	shows_notice boolean not null default false,
	actor text not null check (actor in ('system', 'command', 'admin')),
	actor_user_id uuid references public.profiles (id) on delete set null,
	created_at timestamptz not null default now()
);

create index place_level_changes_city_idx on public.place_level_changes (city_id, created_at desc);
create index place_level_changes_place_idx on public.place_level_changes (place_id, created_at desc);

alter table public.place_level_changes enable row level security;
revoke all on public.place_level_changes from anon, authenticated;

-- Internal: one row of place_level_changes from a place before and after the change.
create function public.log_level_change(
	p_before public.places,
	p_kind public.level_change_kind,
	p_reason text,
	p_actor text,
	p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_after public.places;
begin
	select * into v_after from public.places p where p.id = p_before.id;
	insert into public.place_level_changes (
		place_id, city_id, kind, from_level, to_level, from_origin, to_origin, reason, note,
		shows_notice, actor, actor_user_id
	)
	values (
		p_before.id, p_before.city_id, p_kind, p_before.level, v_after.level,
		case when p_before.level = 'certified' then p_before.cert_origin end,
		case when v_after.level = 'certified' then v_after.cert_origin end,
		p_reason, p_note,
		v_after.level <> 'certified' and v_after.revoked_notice and p_kind in ('revoked', 'unpicked'),
		p_actor,
		case when p_actor = 'admin' then auth.uid() end
	);
end;
$$;

-- The level of one place from its contributions. Internal (submit_contribution, the daily job
-- and the functions below). Returns the level after the change. Its changes are automatic, so
-- they are logged as 'system' whoever started the recompute.
create function public.recompute_place_certification(p_place_id uuid)
returns public.place_level
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_place public.places;
	v_has_contributions boolean;
	v_revocation jsonb;
begin
	select * into v_place from public.places p where p.id = p_place_id for update;
	if not found then
		return null;
	end if;
	v_has_contributions := exists (
		select 1 from public.counted_contributions c where c.place_id = p_place_id
	);

	if v_place.level = 'certified' then
		-- Revocation, for both origins. cert_origin and certified_at stay as history.
		v_revocation := public.revocation_check(p_place_id);
		if v_revocation is not null then
			update public.places
			set
				level = case when v_has_contributions then 'community' else 'osm_only' end::public.place_level,
				revoked_at = now(),
				revoked_notice = true
			where id = p_place_id;
			perform public.log_level_change(v_place, 'revoked', v_revocation ->> 'reason', 'system');
		elsif v_place.cert_origin = 'picked'
			and (public.certification_check(p_place_id) ->> 'meets')::boolean then
			update public.places set cert_origin = 'confirmed', certified_at = now() where id = p_place_id;
			perform public.log_level_change(v_place, 'confirmed', 'conditions_met', 'system');
		end if;
	elsif not v_place.auto_cert_blocked
		and (public.certification_check(p_place_id) ->> 'meets')::boolean then
		update public.places
		set
			level = 'certified',
			cert_origin = 'confirmed',
			certified_at = now(),
			revoked_at = null,
			revoked_notice = false
		where id = p_place_id;
		perform public.log_level_change(v_place, 'certified', 'conditions_met', 'system');
	elsif v_place.level = 'osm_only' and v_has_contributions then
		update public.places set level = 'community' where id = p_place_id;
		perform public.log_level_change(v_place, 'level_up', 'first_contribution', 'system');
	end if;

	return (select p.level from public.places p where p.id = p_place_id);
end;
$$;

-- Internal: every place of a city that has contributions or a certification.
create function public.recompute_city(p_city_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_id uuid;
	v_checked integer := 0;
	v_before bigint;
begin
	select count(*) into v_before from public.place_level_changes where city_id = p_city_id;
	for v_id in
		select p.id from public.places p
		where p.city_id = p_city_id
			and (
				p.level <> 'osm_only'
				or exists (select 1 from public.counted_contributions c where c.place_id = p.id)
			)
		order by p.id
	loop
		perform public.recompute_place_certification(v_id);
		v_checked := v_checked + 1;
	end loop;
	return jsonb_build_object(
		'checked', v_checked,
		'changes', (select count(*) from public.place_level_changes where city_id = p_city_id) - v_before
	);
end;
$$;

-- The daily pg_cron job: time-dependent conditions (14 days, 12 months, 90 days).
create function public.recompute_all_certifications()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_city uuid;
begin
	for v_city in select c.id from public.cities c where c.is_active order by c.id loop
		perform public.recompute_city(v_city);
	end loop;
end;
$$;

select cron.schedule('certification-daily', '23 3 * * *', 'select public.recompute_all_certifications()');

-- ---------------------------------------------------------------------------
-- Team actions: `npm run certify` (secret key) and, in feature 9, the admin pages
-- ---------------------------------------------------------------------------

-- 'command' for a request with the secret key, 'admin' for a signed-in admin, null otherwise.
-- Inside SECURITY DEFINER current_user is the owner: the role comes from the request's JWT.
create function public.certification_actor()
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role'
			then 'command'
		when public.is_admin() then 'admin'
	end;
$$;

-- Errors (stable messages) for all the functions below: not_allowed, place_not_found,
-- note_required, reason_required, and the ones named on each function.
create function public.require_certification_actor()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_actor text := public.certification_actor();
begin
	if v_actor is null then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	return v_actor;
end;
$$;

-- What the team needs to decide: level, origin, dates, block, and both checks.
create function public.certification_status(p_place_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_place public.places;
begin
	perform public.require_certification_actor();
	select * into v_place from public.places p where p.id = p_place_id;
	if not found then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	return jsonb_build_object(
		'name', v_place.name,
		'slug', v_place.slug,
		'level', v_place.level,
		'origin', v_place.cert_origin,
		'certified_at', v_place.certified_at,
		'revoked_at', v_place.revoked_at,
		'revoked_notice', v_place.revoked_notice,
		'blocked', v_place.auto_cert_blocked,
		'missing_from_osm', v_place.osm_missing_since is not null,
		'check', public.certification_check(p_place_id)
	);
end;
$$;

-- Picks a place (also osm_only), or picks it again to renew the date (after a --due check).
-- Removes a block and a removal notice. Then recomputes: a place that already meets the
-- conditions becomes confirmed at once. Errors: place_missing_from_osm, already_confirmed,
-- would_be_revoked (DETAIL: the revocation condition, as JSON).
create function public.pick_place(p_place_id uuid, p_note text)
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
	v_revocation jsonb;
	v_level public.place_level;
begin
	if v_note is null then
		raise exception 'note_required' using errcode = '22023';
	end if;
	select * into v_place from public.places p where p.id = p_place_id for update;
	if not found or v_place.review_status <> 'approved' then
		raise exception 'place_not_found' using errcode = 'P0001';
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
		certified_at = now(),
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

-- Removes the badge (picked or confirmed). A confirmed place is always blocked (it would come
-- back at the next recompute); a picked one only with p_block. p_notice false: no "Certification
-- removed" line. Error: not_certified.
create function public.unpick_place(
	p_place_id uuid,
	p_reason text,
	p_block boolean default false,
	p_notice boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_actor text := public.require_certification_actor();
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_place public.places;
	v_block boolean;
begin
	if v_reason is null then
		raise exception 'reason_required' using errcode = '22023';
	end if;
	select * into v_place from public.places p where p.id = p_place_id for update;
	if not found then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	if v_place.level <> 'certified' then
		raise exception 'not_certified' using errcode = 'P0001';
	end if;
	v_block := coalesce(p_block, false) or v_place.cert_origin = 'confirmed';

	update public.places p
	set
		level = case
			when exists (select 1 from public.counted_contributions c where c.place_id = p.id)
				then 'community'
			else 'osm_only'
		end::public.place_level,
		revoked_at = now(),
		revoked_notice = coalesce(p_notice, true),
		auto_cert_blocked = v_block
	where p.id = p_place_id;
	perform public.log_level_change(v_place, 'unpicked', v_reason, v_actor);
	if v_block and not v_place.auto_cert_blocked then
		perform public.log_level_change(
			(select p from public.places p where p.id = p_place_id), 'blocked', v_reason, v_actor
		);
	end if;

	return jsonb_build_object(
		'level', (select p.level from public.places p where p.id = p_place_id),
		'blocked', v_block,
		'notice', coalesce(p_notice, true)
	);
end;
$$;

-- Allows the automatic certification again, then recomputes. Error: not_blocked.
create function public.unblock_place(p_place_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_actor text := public.require_certification_actor();
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_place public.places;
begin
	if v_reason is null then
		raise exception 'reason_required' using errcode = '22023';
	end if;
	select * into v_place from public.places p where p.id = p_place_id for update;
	if not found then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	if not v_place.auto_cert_blocked then
		raise exception 'not_blocked' using errcode = 'P0001';
	end if;
	update public.places set auto_cert_blocked = false where id = p_place_id;
	perform public.log_level_change(v_place, 'unblocked', v_reason, v_actor);
	return jsonb_build_object('level', public.recompute_place_certification(p_place_id));
end;
$$;

-- Recomputes every place of a city now (the daily job does it anyway).
create function public.recompute_city_certification(p_city_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
	perform public.require_certification_actor();
	return public.recompute_city(p_city_id);
end;
$$;

-- Certified places (origin, date, score, users) and, with blocked true, the blocked ones.
create function public.certification_list(p_city_id uuid)
returns table (
	place_id uuid,
	slug text,
	name text,
	level public.place_level,
	origin public.cert_origin,
	certified_at timestamptz,
	blocked boolean,
	score_pct integer,
	votes integer,
	users integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	perform public.require_certification_actor();
	return query
	select
		p.id,
		p.slug,
		p.name,
		p.level,
		case when p.level = 'certified' then p.cert_origin end,
		case when p.level = 'certified' then p.certified_at end,
		p.auto_cert_blocked,
		s.score_pct,
		coalesce(s.votes, 0),
		(
			select count(distinct coalesce(c.user_id, c.anon_key))::integer
			from public.counted_contributions c where c.place_id = p.id
		)
	from public.places p
	left join public.place_scores s on s.place_id = p.id
	where p.city_id = p_city_id and (p.level = 'certified' or p.auto_cert_blocked)
	order by p.auto_cert_blocked, p.cert_origin, p.name;
end;
$$;

-- Automatic changes (certified, confirmed, revoked) of the last p_days days, newest first.
create function public.certification_recent(p_city_id uuid, p_days integer default 30)
returns table (
	place_id uuid,
	slug text,
	name text,
	kind public.level_change_kind,
	from_level public.place_level,
	to_level public.place_level,
	from_origin public.cert_origin,
	to_origin public.cert_origin,
	reason text,
	shows_notice boolean,
	created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	perform public.require_certification_actor();
	return query
	select
		p.id, p.slug, p.name, ch.kind, ch.from_level, ch.to_level, ch.from_origin, ch.to_origin,
		ch.reason, ch.shows_notice, ch.created_at
	from public.place_level_changes ch
	join public.places p on p.id = ch.place_id
	where ch.city_id = p_city_id
		and ch.actor = 'system'
		and ch.kind in ('certified', 'confirmed', 'revoked')
		and ch.created_at > now() - make_interval(days => greatest(p_days, 1))
	order by ch.created_at desc, ch.id desc;
end;
$$;

-- Picked places older than manual_recheck_months that do not meet the conditions (otherwise
-- they would be confirmed): they keep the badge until the team checks them again.
create function public.certification_due(p_city_id uuid)
returns table (
	place_id uuid,
	slug text,
	name text,
	certified_at timestamptz,
	missing text[],
	users integer,
	score_pct integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_settings public.certification_settings := public.city_settings(p_city_id);
begin
	perform public.require_certification_actor();
	return query
	select
		p.id,
		p.slug,
		p.name,
		p.certified_at,
		array(select jsonb_array_elements_text(k.c -> 'missing')),
		(k.c ->> 'users')::integer,
		(k.c ->> 'score_pct')::integer
	from public.places p
	cross join lateral (select public.certification_check(p.id) as c) k
	where p.city_id = p_city_id
		and p.level = 'certified'
		and p.cert_origin = 'picked'
		and p.certified_at < now() - make_interval(months => v_settings.manual_recheck_months)
		and not (k.c ->> 'meets')::boolean
	order by p.certified_at, p.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_contribution(): same as 20261029120000_photos.sql, but the level comes from
-- recompute_place_certification() (same transaction), counts read counted_contributions, and
-- the result says whether the place is blocked
-- ---------------------------------------------------------------------------

create or replace function public.submit_contribution(
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

	-- osm_only → community, automatic certification or revocation, in this transaction.
	v_level := public.recompute_place_certification(v_place.id);

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
		-- How many counted answers match the user's, per attribute ("5 confirm · just now").
		'confirmations', (
			select jsonb_build_object(
				'wifi', count(*) filter (where c.wifi = p_wifi),
				'outlets', count(*) filter (where c.outlets = p_outlets),
				'noise', count(*) filter (where c.noise = p_noise),
				'long_stays', count(*) filter (where c.long_stays = p_long_stays)
			)
			from public.counted_contributions c
			where c.place_id = v_place.id
		),
		'contributors', (
			select count(distinct coalesce(c.user_id, c.anon_key))
			from public.counted_contributions c
			where c.place_id = v_place.id
		),
		'min_users', v_settings.min_users,
		-- The photos are uploaded after the contribution (reserve_photo, publish_photo).
		'id', v_id,
		-- How many photos this update can still take today.
		'photo_slots', greatest(0, least(
			v_settings.photos_per_contribution,
			v_settings.daily_photo_limit - (
				select count(*) from public.photos ph
				where ph.user_id = v_user and ph.created_at > now() - interval '24 hours'
			)
		)),
		-- No automatic certification for this place: no "N of 10 users" bar.
		'blocked', (select p.auto_cert_blocked from public.places p where p.id = v_place.id)
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

grant select on public.place_scores, public.place_attributes, public.place_laptop_rules,
	public.place_notes, public.place_contributors, public.place_list_items, public.place_details,
	public.city_summaries
	to anon, authenticated;

-- Functions: Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function
	public.city_center_places(uuid, integer, boolean),
	public.opening_hours_week(text),
	public.weekday_daytime_ok(text, integer, integer, numeric, integer),
	public.revocation_check(uuid),
	public.certification_check(uuid),
	public.log_level_change(public.places, public.level_change_kind, text, text, text),
	public.recompute_place_certification(uuid),
	public.recompute_city(uuid),
	public.recompute_all_certifications(),
	public.certification_actor(),
	public.require_certification_actor(),
	public.certification_status(uuid),
	public.pick_place(uuid, text),
	public.unpick_place(uuid, text, boolean, boolean),
	public.unblock_place(uuid, text),
	public.recompute_city_certification(uuid),
	public.certification_list(uuid),
	public.certification_recent(uuid, integer),
	public.certification_due(uuid)
	from public, anon, authenticated;
grant execute on function public.city_center_places(uuid, integer, boolean) to anon, authenticated;
-- The team's functions check the caller themselves (require_certification_actor): the secret
-- key, or a signed-in admin.
grant execute on function
	public.certification_status(uuid),
	public.pick_place(uuid, text),
	public.unpick_place(uuid, text, boolean, boolean),
	public.unblock_place(uuid, text),
	public.recompute_city_certification(uuid),
	public.certification_list(uuid),
	public.certification_recent(uuid, integer),
	public.certification_due(uuid)
	to authenticated, service_role;
