-- User photos (feature 7c), schema side. Storage (buckets, upload rules, file deletion queue,
-- cleanup jobs) is in 20261029130000_photo_storage.sql.
-- - photos: one row per photo, tied to the user, the place and the contribution it came with.
--   A photo describes the place, not the vote: it stays published when its contribution is
--   superseded. Deleted with the account (profiles cascade), files included (deletion queue).
-- - The app never touches the table: reserve_photo() books a random file name (and applies the
--   limits: 3 per contribution, 15 per user in 24 hours), the two files are uploaded to that
--   name only, publish_photo() makes the photo public once both files are there.
-- - Public views: place_photos (12 latest visible, credit only when the user shows their name,
--   no user, contribution or date), cover_path in place_list_items, photo_paths and photo_count
--   in place_details.
-- - delete_my_photo() for /me (feature 10), moderate_photo() for `npm run photos`.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.certification_settings
	add column photos_per_contribution integer not null default 3 check (photos_per_contribution >= 0),
	add column daily_photo_limit integer not null default 15 check (daily_photo_limit >= 0);

-- ---------------------------------------------------------------------------
-- photos: closed to the app, like contributions
-- ---------------------------------------------------------------------------

drop policy "Visible photos are public" on public.photos;
drop policy "Users see visible photos and their own" on public.photos;
drop policy "Users add their own photos" on public.photos;
drop policy "Admins update photos" on public.photos;
drop policy "Users delete their own photos" on public.photos;
revoke select, insert, update, delete on public.photos from anon, authenticated;

drop trigger photos_protect_insert on public.photos;
drop function public.protect_photo_insert();

-- The table has never had rows: terms_version can be required at once.
alter table public.photos
	alter column user_id drop default,
	-- Null: booked, files not confirmed yet. Never public until set by publish_photo().
	add column published_at timestamptz,
	-- The version of the Terms the user accepted by sending (TERMS_VERSION in src/lib/config.ts).
	add column terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

drop index public.photos_place_idx;
create index photos_visible_place_idx
	on public.photos (place_id, published_at desc)
	where status = 'visible' and published_at is not null;
create index photos_user_created_idx on public.photos (user_id, created_at);
create index photos_contribution_idx on public.photos (contribution_id);

-- Published, visible photos of approved places. Internal: no grants; the public views read it.
create view public.visible_photos as
select ph.id, ph.place_id, ph.user_id, ph.storage_path, ph.width, ph.height, ph.published_at
from public.photos ph
join public.places p on p.id = ph.place_id and p.review_status = 'approved'
where ph.status = 'visible' and ph.published_at is not null;

-- ---------------------------------------------------------------------------
-- Public views
-- ---------------------------------------------------------------------------

-- The gallery of a place: the 12 latest visible photos, newest first (sort_order 1).
-- The credit is the public name only when the user chose to show it. No user, contribution or
-- date: a name is never linked to a date or to an identifier shared across places.
create view public.place_photos as
select place_id, path, width, height, credit, sort_order
from (
	select
		v.place_id,
		v.storage_path as path,
		v.width,
		v.height,
		case when pr.show_name is true then pr.display_name end as credit,
		row_number() over (partition by v.place_id order by v.published_at desc, v.id)::integer
			as sort_order
	from public.visible_photos v
	left join public.profiles pr on pr.id = v.user_id
) r
where sort_order <= 12;

-- Same as 20261026120000_contributions.sql, plus cover_path at the end.
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
			select count(*) from public.active_contributions c
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

-- Same as 20261026120000_contributions.sql, plus photo_paths and photo_count at the end.
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
	st.checkin_max_accuracy_m,
	coalesce(ph.paths, '{}') as photo_paths,
	coalesce(ph.count, 0) as photo_count
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
-- submit_contribution(): same as 20261026120000_contributions.sql, plus the contribution id and
-- the photo slots left in its result
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
		))
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos: booking, deletion, moderation
-- ---------------------------------------------------------------------------

-- Books a photo for one of the user's contributions of the last 24 hours (also a superseded
-- one: a retry after a new update still works) and returns its random file name. The upload
-- rules accept only booked names (20261029130000_photo_storage.sql). Bookings count in the
-- limits, so the bucket can never hold more than the limits allow.
-- Errors (stable messages): not_signed_in, email_not_confirmed, contribution_not_found,
-- invalid_photo, photo_limit_contribution, photo_daily_limit.
create function public.reserve_photo(
	p_contribution_id uuid,
	p_width integer,
	p_height integer,
	p_terms_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_user uuid := auth.uid();
	v_contribution public.contributions;
	v_settings public.certification_settings;
	v_id uuid := gen_random_uuid();
	v_path text := v_id::text || '.webp';
begin
	if v_user is null then
		raise exception 'not_signed_in' using errcode = '42501';
	end if;

	if not exists (
		select 1 from auth.users u where u.id = v_user and u.email_confirmed_at is not null
	) then
		raise exception 'email_not_confirmed' using errcode = 'P0001';
	end if;

	select * into v_contribution
	from public.contributions c
	where c.id = p_contribution_id
		and c.user_id = v_user
		and c.created_at > now() - interval '24 hours';
	if not found then
		raise exception 'contribution_not_found' using errcode = 'P0001';
	end if;

	-- The large version: long side 1200 px at most.
	if p_width is null or p_height is null
		or p_width not between 1 and 1200 or p_height not between 1 and 1200
		or p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
		raise exception 'invalid_photo' using errcode = '22023';
	end if;

	v_settings := public.city_settings(v_contribution.city_id);

	-- One booking at a time per user: the limits stay exact.
	perform pg_advisory_xact_lock(hashtextextended('photo:' || v_user::text, 0));

	if (
		select count(*) from public.photos ph where ph.contribution_id = v_contribution.id
	) >= v_settings.photos_per_contribution then
		raise exception 'photo_limit_contribution' using errcode = 'P0001';
	end if;

	if (
		select count(*) from public.photos ph
		where ph.user_id = v_user and ph.created_at > now() - interval '24 hours'
	) >= v_settings.daily_photo_limit then
		raise exception 'photo_daily_limit' using errcode = 'P0001';
	end if;

	insert into public.photos (
		id, place_id, user_id, contribution_id, storage_path, width, height, terms_version
	)
	values (
		v_id, v_contribution.place_id, v_user, v_contribution.id, v_path, p_width, p_height,
		p_terms_version
	);

	return jsonb_build_object('id', v_id, 'path', v_path);
end;
$$;

-- The user deletes one of their own photos (published or not): the row goes at once, the files
-- through the deletion queue. True if a photo was deleted. For /me (feature 10).
create function public.delete_my_photo(p_photo_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'not_signed_in' using errcode = '42501';
	end if;
	delete from public.photos ph where ph.id = p_photo_id and ph.user_id = auth.uid();
	return found;
end;
$$;

-- `npm run photos`: hide, show again or remove for good (row now, files through the queue).
-- service_role only. Returns the photo's status after the action ('removed' for remove).
create function public.moderate_photo(p_photo_id uuid, p_action text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
	if p_action = 'remove' then
		delete from public.photos ph where ph.id = p_photo_id;
	elsif p_action in ('hide', 'show') then
		update public.photos ph
		set status = case when p_action = 'hide' then 'hidden' else 'visible' end::public.photo_status
		where ph.id = p_photo_id;
	else
		raise exception 'invalid_action' using errcode = '22023';
	end if;
	if not found then
		raise exception 'photo_not_found' using errcode = 'P0001';
	end if;
	return case p_action when 'remove' then 'removed' when 'hide' then 'hidden' else 'visible' end;
end;
$$;

-- `npm run photos -- --list <city>/<place>`: every photo of a place, for moderation.
-- service_role only.
create function public.list_place_photos(p_city_slug text, p_place_slug text)
returns table (
	id uuid,
	storage_path text,
	status public.photo_status,
	published boolean,
	created_at timestamptz,
	display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
	select ph.id, ph.storage_path, ph.status, ph.published_at is not null, ph.created_at, pr.display_name
	from public.photos ph
	join public.places p on p.id = ph.place_id
	join public.cities ci on ci.id = p.city_id
	left join public.profiles pr on pr.id = ph.user_id
	where ci.slug = p_city_slug and p.slug = p_place_slug
	order by ph.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

grant select on public.place_photos, public.place_list_items, public.place_details
	to anon, authenticated;

revoke execute on function
	public.reserve_photo(uuid, integer, integer, text),
	public.delete_my_photo(uuid),
	public.moderate_photo(uuid, text),
	public.list_place_photos(text, text)
	from public, anon, authenticated;
grant execute on function
	public.reserve_photo(uuid, integer, integer, text),
	public.delete_my_photo(uuid)
	to authenticated;
grant execute on function
	public.moderate_photo(uuid, text),
	public.list_place_photos(text, text)
	to service_role;
