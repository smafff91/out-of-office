-- Certification rules (feature 8, docs/certificazione.md). Changes nothing: everything runs
-- inside a transaction that is rolled back, on a temporary city with the default thresholds
-- (10 users, half checked in, 14 days, 75%; revocation below 60% with 10 votes, or a majority
-- of Wi-Fi "None" / "Not really" among at least 3 contributions of the last 90 days).
--   npx supabase db query --linked -f supabase/tests/certification.sql
-- (also run by `npm run test:db`). Any failed check raises an error; the last line prints
-- "certification: ok".

begin;

-- The JWT claims of the request: the secret key, a signed-in user, or nobody.
create function pg_temp.as_service()
returns void
language sql
as $$
	select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

create function pg_temp.as_user(p_user uuid)
returns void
language sql
as $$
	select set_config(
		'request.jwt.claims',
		case when p_user is null then '{"role":"anon"}' else json_build_object('sub', p_user, 'role', 'authenticated')::text end,
		true
	);
$$;

create function pg_temp.place(p_city uuid, p_slug text, p_hours text default null)
returns uuid
language sql
as $$
	insert into public.places (city_id, slug, name, geom, opening_hours)
	values (p_city, p_slug, p_slug, extensions.st_setsrid(extensions.st_makepoint(2.17, 41.39), 4326), p_hours)
	returning id;
$$;

-- One contribution written straight into the table (as the owner, like a past submission).
-- No user: a deleted account (random key, or p_key to give several rows the same author).
create function pg_temp.vote(
	p_place uuid,
	p_yes boolean default true,
	p_days numeric default 0,
	p_checkin boolean default false,
	p_wifi public.wifi_level default 'fast',
	p_long public.long_stays default 'welcome',
	p_user uuid default null,
	p_key uuid default null,
	p_superseded boolean default false
)
returns uuid
language sql
as $$
	insert into public.contributions (
		place_id, user_id, anon_key, would_work_again, wifi, outlets, noise, long_stays, checked_in,
		created_at, superseded_at
	)
	values (
		p_place, p_user, case when p_user is null then coalesce(p_key, gen_random_uuid()) end,
		p_yes, p_wifi, 'plenty', 'quiet', p_long, p_checkin,
		now() - p_days * interval '1 day', case when p_superseded then now() end
	)
	returning id;
$$;

-- p_users people: the first one p_span days ago, the others now; the first p_yes say yes, the
-- first p_checkins checked in.
create function pg_temp.crowd(
	p_place uuid,
	p_users integer,
	p_span numeric default 15,
	p_yes integer default null,
	p_checkins integer default null
)
returns void
language plpgsql
as $$
begin
	for i in 1..p_users loop
		perform pg_temp.vote(
			p_place,
			p_yes => i <= coalesce(p_yes, p_users),
			p_days => case when i = 1 then p_span else 0 end,
			p_checkin => i <= coalesce(p_checkins, ceil(p_users / 2.0)::integer)
		);
	end loop;
end;
$$;

create function pg_temp.check_of(p_place uuid)
returns jsonb
language sql
as $$
	select public.certification_check(p_place);
$$;

create function pg_temp.meets(p_place uuid)
returns boolean
language sql
as $$
	select (public.certification_check(p_place) ->> 'meets')::boolean;
$$;

create function pg_temp.missing(p_place uuid)
returns text
language sql
as $$
	select coalesce(string_agg(m, ','), '') from jsonb_array_elements_text(public.certification_check(p_place) -> 'missing') m;
$$;

-- The error message of a statement, or 'ok'.
create function pg_temp.error_of(p_sql text)
returns text
language plpgsql
as $$
begin
	execute p_sql;
	return 'ok';
exception when others then
	return sqlerrm;
end;
$$;

do $$
declare
	v_city uuid := gen_random_uuid();
	v_place uuid;
	v_other uuid;
	v_user uuid := gen_random_uuid();
	v_admin uuid := gen_random_uuid();
	v_unconfirmed uuid := gen_random_uuid();
	v_key uuid;
	v_check jsonb;
	v_json jsonb;
	v_text text;
	v_count integer;
	v_level public.place_level;
	v_row public.places;
begin
	insert into public.cities (id, slug, name, country_code, timezone, center, bbox)
	values (
		v_city, 'zz-test-certification', 'Test city', 'ES', 'Europe/Madrid',
		extensions.st_setsrid(extensions.st_makepoint(2.17, 41.39), 4326),
		extensions.st_makeenvelope(2.1, 41.3, 2.3, 41.5, 4326)
	);
	insert into public.certification_settings (
		city_id, min_users, min_checkin_ratio, min_span_days, min_score, revoke_below_score,
		revoke_min_votes, revoke_window_months, review_reports_count, review_reports_window_days,
		manual_recheck_months, vote_cooldown_days, checkin_radius_m, score_min_votes
	)
	values (v_city, 10, 0.50, 14, 0.75, 0.60, 10, 12, 2, 30, 12, 30, 100, 5);
	insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
		(v_user, 'cert-user@test.invalid', now(), '{}'),
		(v_admin, 'cert-admin@test.invalid', now(), '{}'),
		(v_unconfirmed, 'cert-unconfirmed@test.invalid', null, '{}');
	update public.profiles set role = 'admin' where id = v_admin;

	-- ---------------------------------------------------------------------------
	-- Thresholds: 9 / 10 users, 13 / 14 days, 74% / 75%, exactly half checked in
	-- ---------------------------------------------------------------------------

	v_place := pg_temp.place(v_city, 'users-10');
	perform pg_temp.crowd(v_place, 10, p_checkins => 5);
	if not pg_temp.meets(v_place) then raise exception '10 users, 5 check-ins: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'users-9');
	perform pg_temp.crowd(v_place, 9);
	if pg_temp.missing(v_place) <> 'users' then raise exception '9 users: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'span-14');
	perform pg_temp.crowd(v_place, 10, p_span => 14);
	if not pg_temp.meets(v_place) then raise exception '14 days: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'span-13');
	perform pg_temp.crowd(v_place, 10, p_span => 13.99);
	if pg_temp.missing(v_place) <> 'span' then raise exception '13.99 days: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'score-75');
	perform pg_temp.crowd(v_place, 20, p_yes => 15);
	if not pg_temp.meets(v_place) then raise exception '75%%: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'score-74');
	perform pg_temp.crowd(v_place, 50, p_yes => 37);
	if pg_temp.missing(v_place) <> 'score' then raise exception '74%%: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'checkins-4');
	perform pg_temp.crowd(v_place, 10, p_checkins => 4);
	if pg_temp.missing(v_place) <> 'checkins' then raise exception '4 of 10 checked in: missing %', pg_temp.missing(v_place); end if;

	-- Wi-Fi and Long stays: more than half.
	v_place := pg_temp.place(v_city, 'wifi-half');
	perform pg_temp.crowd(v_place, 5, p_checkins => 5);
	for i in 1..5 loop perform pg_temp.vote(v_place, p_wifi => 'none', p_days => 200); end loop;
	if pg_temp.missing(v_place) <> 'wifi' then raise exception 'Wi-Fi 5 of 10: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'long-half');
	perform pg_temp.crowd(v_place, 5, p_checkins => 5);
	for i in 1..5 loop perform pg_temp.vote(v_place, p_long => 'not_really', p_days => 200); end loop;
	if pg_temp.missing(v_place) <> 'long_stays' then raise exception 'Welcome 5 of 10: missing %', pg_temp.missing(v_place); end if;

	-- ---------------------------------------------------------------------------
	-- Who counts
	-- ---------------------------------------------------------------------------

	-- An account without a confirmed email does not count; a deleted account (key) does.
	v_place := pg_temp.place(v_city, 'unconfirmed');
	perform pg_temp.crowd(v_place, 9);
	perform pg_temp.vote(v_place, p_user => v_unconfirmed);
	if pg_temp.missing(v_place) <> 'users' then raise exception 'unconfirmed account counted: %', pg_temp.check_of(v_place); end if;
	select votes into v_count from public.place_scores where place_id = v_place;
	if v_count <> 9 then raise exception 'place_scores counts an unconfirmed account: %', v_count; end if;
	select contributors into v_count from public.place_details where id = v_place;
	if v_count <> 9 then raise exception 'place_details counts an unconfirmed account: %', v_count; end if;
	update auth.users set email_confirmed_at = now() where id = v_unconfirmed;
	if not pg_temp.meets(v_place) then raise exception 'confirmed account not counted: %', pg_temp.check_of(v_place); end if;

	-- A verified check-in in a superseded contribution counts for its author.
	v_place := pg_temp.place(v_city, 'history');
	perform pg_temp.crowd(v_place, 9, p_checkins => 4);
	v_key := gen_random_uuid();
	perform pg_temp.vote(v_place, p_checkin => true, p_days => 3, p_key => v_key, p_superseded => true);
	perform pg_temp.vote(v_place, p_checkin => false, p_key => v_key);
	v_check := pg_temp.check_of(v_place);
	if (v_check ->> 'checkin_users')::integer <> 5 or not (v_check ->> 'meets')::boolean then
		raise exception 'check-in in the history not counted: %', v_check;
	end if;
	if (v_check ->> 'users')::integer <> 10 then raise exception 'history counted twice: %', v_check; end if;

	-- Photos never count.
	v_place := pg_temp.place(v_city, 'photos');
	perform pg_temp.crowd(v_place, 9);
	v_check := pg_temp.check_of(v_place);
	insert into public.photos (place_id, user_id, storage_path, width, height, status, published_at, terms_version)
	select v_place, v_user, gen_random_uuid()::text || '.webp', 1200, 900, 'visible', now(), '2026-10-29'
	from generate_series(1, 3);
	if pg_temp.check_of(v_place) <> v_check then raise exception 'photos changed the check'; end if;

	-- ---------------------------------------------------------------------------
	-- Opening hours and reports
	-- ---------------------------------------------------------------------------

	v_place := pg_temp.place(v_city, 'evening', 'Mo-Su 18:00-02:30');
	perform pg_temp.crowd(v_place, 10);
	if pg_temp.missing(v_place) <> 'daytime' then raise exception 'evening hours: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'three-days', 'Mo-We 09:00-13:00; Th-Su off');
	perform pg_temp.crowd(v_place, 10);
	if not pg_temp.meets(v_place) then raise exception '3 weekdays of 4 hours: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'two-days', 'Mo-Tu 09:00-13:00; We-Fr 09:00-12:59; Sa-Su off');
	perform pg_temp.crowd(v_place, 10);
	if pg_temp.missing(v_place) <> 'daytime' then raise exception '2 weekdays of 4 hours: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'unreadable', 'Mo-Fr 19:00-23:00; PH off');
	perform pg_temp.crowd(v_place, 10);
	if not pg_temp.meets(v_place) then raise exception 'unreadable hours blocked: missing %', pg_temp.missing(v_place); end if;

	v_place := pg_temp.place(v_city, 'reported');
	perform pg_temp.crowd(v_place, 10);
	insert into public.reports (place_id, reason) values (v_place, 'inappropriate_content');
	insert into public.reports (place_id, reason, status) values (v_place, 'laptops_not_allowed', 'resolved');
	if not pg_temp.meets(v_place) then raise exception 'photo report or resolved report blocked: missing %', pg_temp.missing(v_place); end if;
	insert into public.reports (place_id, reason) values (v_place, 'laptops_not_allowed');
	if pg_temp.missing(v_place) <> 'reports' then raise exception 'open report: missing %', pg_temp.missing(v_place); end if;

	-- ---------------------------------------------------------------------------
	-- Automatic certification: in submit_contribution, in the same transaction
	-- ---------------------------------------------------------------------------

	v_place := pg_temp.place(v_city, 'submit');
	perform pg_temp.crowd(v_place, 9, p_span => 20, p_checkins => 5);
	update public.places set level = 'community' where id = v_place;
	perform set_config('request.method', 'POST', true);
	perform pg_temp.as_user(v_user);
	v_json := public.submit_contribution(
		p_place_id => v_place, p_would_work_again => true, p_wifi => 'fast', p_outlets => 'plenty',
		p_noise => 'quiet', p_long_stays => 'welcome'
	);
	if v_json ->> 'level' <> 'certified' or (v_json ->> 'blocked')::boolean then
		raise exception 'the 10th contribution did not certify: %', v_json;
	end if;
	select * into v_row from public.places where id = v_place;
	if v_row.cert_origin <> 'confirmed' or v_row.revoked_at is not null then raise exception 'origin after submit: %', v_row.cert_origin; end if;
	select count(*) into v_count from public.place_level_changes
	where place_id = v_place and kind = 'certified' and actor = 'system' and reason = 'conditions_met' and to_origin = 'confirmed';
	if v_count <> 1 then raise exception 'automatic certification not logged'; end if;

	-- The first contribution of an osm_only place: community, logged.
	v_place := pg_temp.place(v_city, 'first');
	v_json := public.submit_contribution(
		p_place_id => v_place, p_would_work_again => true, p_wifi => 'fast', p_outlets => 'plenty',
		p_noise => 'quiet', p_long_stays => 'welcome'
	);
	if v_json ->> 'level' <> 'community' then raise exception 'first contribution: %', v_json ->> 'level'; end if;
	if not exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'level_up') then
		raise exception 'osm_only → community not logged';
	end if;

	-- ---------------------------------------------------------------------------
	-- Who may pick: the secret key or an admin, nobody else
	-- ---------------------------------------------------------------------------

	v_place := pg_temp.place(v_city, 'guard');
	perform pg_temp.as_user(v_user);
	v_text := pg_temp.error_of(format('select public.pick_place(%L, %L)', v_place, 'desk check'));
	if v_text <> 'not_allowed' then raise exception 'authenticated (not admin) picks: %', v_text; end if;
	perform pg_temp.as_user(null);
	v_text := pg_temp.error_of(format('select public.pick_place(%L, %L)', v_place, 'desk check'));
	if v_text <> 'not_allowed' then raise exception 'anon claims pick: %', v_text; end if;
	perform set_config('request.jwt.claims', '', true);
	v_text := pg_temp.error_of(format('select public.certification_list(%L)', v_city));
	if v_text <> 'not_allowed' then raise exception 'no claims lists: %', v_text; end if;

	perform pg_temp.as_service();
	v_text := pg_temp.error_of(format('select public.pick_place(%L, %L)', v_place, '   '));
	if v_text <> 'note_required' then raise exception 'empty note: %', v_text; end if;

	perform pg_temp.as_user(v_admin);
	v_json := public.pick_place(v_place, 'Instagram, Google photos, laptop rules on the website');
	if v_json ->> 'level' <> 'certified' or v_json ->> 'origin' <> 'picked' then raise exception 'admin pick: %', v_json; end if;
	select count(*) into v_count from public.place_level_changes
	where place_id = v_place and kind = 'picked' and actor = 'admin' and actor_user_id = v_admin
		and from_level = 'osm_only' and note like 'Instagram%';
	if v_count <> 1 then raise exception 'admin pick not logged'; end if;

	-- The month only in the public view, never the note or the exact date.
	select certified_on::text into v_text from public.place_details where id = v_place;
	if v_text <> to_char(date_trunc('month', now() at time zone 'Europe/Madrid'), 'YYYY-MM-DD') then
		raise exception 'certified_on is not the month: %', v_text;
	end if;

	-- ---------------------------------------------------------------------------
	-- Picked → confirmed, pick refused, renewal, due
	-- ---------------------------------------------------------------------------

	perform pg_temp.as_service();
	v_place := pg_temp.place(v_city, 'picked-confirmed');
	perform pg_temp.vote(v_place);
	update public.places set level = 'community' where id = v_place;
	v_json := public.pick_place(v_place, 'desk check');
	if v_json ->> 'origin' <> 'picked' then raise exception 'pick: %', v_json; end if;
	perform pg_temp.crowd(v_place, 9, p_checkins => 5);
	v_level := public.recompute_place_certification(v_place);
	select * into v_row from public.places where id = v_place;
	if v_level <> 'certified' or v_row.cert_origin <> 'confirmed' then raise exception 'picked → confirmed: % %', v_level, v_row.cert_origin; end if;
	if not exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'confirmed' and from_origin = 'picked' and to_origin = 'confirmed') then
		raise exception 'picked → confirmed not logged';
	end if;
	v_text := pg_temp.error_of(format('select public.pick_place(%L, %L)', v_place, 'again'));
	if v_text <> 'already_confirmed' then raise exception 'pick of a confirmed place: %', v_text; end if;

	-- A place a pick would lose at once: refused, with the condition.
	v_place := pg_temp.place(v_city, 'would-be-revoked');
	perform pg_temp.crowd(v_place, 10, p_yes => 5);
	v_text := pg_temp.error_of(format('select public.pick_place(%L, %L)', v_place, 'desk check'));
	if v_text <> 'would_be_revoked' then raise exception 'pick of a revocable place: %', v_text; end if;
	if (select level from public.places where id = v_place) = 'certified' then raise exception 'refused pick certified'; end if;

	-- Picked 13 months ago without the conditions: due. 11 months: not yet. Picking again renews.
	v_place := pg_temp.place(v_city, 'due');
	v_other := pg_temp.place(v_city, 'not-due');
	perform public.pick_place(v_place, 'desk check');
	perform public.pick_place(v_other, 'desk check');
	update public.places set certified_at = now() - interval '13 months' where id = v_place;
	update public.places set certified_at = now() - interval '11 months' where id = v_other;
	select count(*), max(slug) into v_count, v_text from public.certification_due(v_city);
	if v_count <> 1 or v_text <> 'due' then raise exception 'certification_due: % rows, %', v_count, v_text; end if;
	perform public.recompute_city_certification(v_city);
	if (select level from public.places where id = v_place) <> 'certified' then raise exception 'an old pick lost the badge by itself'; end if;
	v_json := public.pick_place(v_place, 'checked again');
	if not (v_json ->> 'renewed')::boolean then raise exception 'renewal: %', v_json; end if;
	select count(*) into v_count from public.certification_due(v_city);
	if v_count <> 0 then raise exception 'renewed pick still due'; end if;

	-- ---------------------------------------------------------------------------
	-- Revocations: score, Wi-Fi, Long stays (both origins)
	-- ---------------------------------------------------------------------------

	-- Exactly 60% (6 of 10): kept. Below (5 of 10, next place): removed.
	v_place := pg_temp.place(v_city, 'score-60');
	perform public.pick_place(v_place, 'desk check');
	perform pg_temp.crowd(v_place, 10, p_yes => 6, p_span => 100);
	if public.recompute_place_certification(v_place) <> 'certified' then raise exception '6 of 10 (60%%) revoked'; end if;
	if public.revocation_check(v_place) is not null then raise exception '60%%: revocation condition %', public.revocation_check(v_place); end if;

	v_place := pg_temp.place(v_city, 'revoke-score');
	perform public.pick_place(v_place, 'desk check');
	perform pg_temp.crowd(v_place, 10, p_yes => 5, p_span => 100);
	v_level := public.recompute_place_certification(v_place);
	select * into v_row from public.places where id = v_place;
	if v_level <> 'community' or v_row.revoked_at is null or not v_row.revoked_notice then
		raise exception 'score below 60%%: %', v_level;
	end if;
	if v_row.cert_origin <> 'picked' or v_row.certified_at is null then raise exception 'history of the origin lost'; end if;
	if not exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'revoked' and reason = 'score_below' and shows_notice) then
		raise exception 'score revocation not logged';
	end if;
	select removed_on::text into v_text from public.place_details where id = v_place;
	if v_text is distinct from to_char(date_trunc('month', now() at time zone 'Europe/Madrid'), 'YYYY-MM-DD') then
		raise exception 'removed_on: %', v_text;
	end if;
	-- After 90 days the notice is gone.
	update public.places set revoked_at = now() - interval '91 days' where id = v_place;
	if (select removed_on from public.place_details where id = v_place) is not null then raise exception 'notice after 90 days'; end if;

	-- 59% with 10+ votes older than 12 months: no revocation.
	v_place := pg_temp.place(v_city, 'old-votes');
	perform public.pick_place(v_place, 'desk check');
	for i in 1..10 loop perform pg_temp.vote(v_place, p_yes => i <= 5, p_days => 400); end loop;
	if public.recompute_place_certification(v_place) <> 'certified' then raise exception 'votes older than 12 months revoked'; end if;

	-- Confirmed place, then 2 of 3 recent contributions say Wi-Fi "None".
	v_place := pg_temp.place(v_city, 'revoke-wifi');
	perform pg_temp.crowd(v_place, 10);
	if public.recompute_place_certification(v_place) <> 'certified' then raise exception 'revoke-wifi not confirmed'; end if;
	update public.contributions set created_at = now() - interval '120 days' where place_id = v_place;
	perform pg_temp.vote(v_place);
	perform pg_temp.vote(v_place, p_wifi => 'none');
	if public.recompute_place_certification(v_place) <> 'certified' then raise exception '1 of 2 recent Wi-Fi None revoked'; end if;
	perform pg_temp.vote(v_place, p_wifi => 'none');
	if public.recompute_place_certification(v_place) <> 'community' then raise exception '2 of 3 Wi-Fi None not revoked'; end if;
	if not exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'revoked' and reason = 'wifi_none' and from_origin = 'confirmed') then
		raise exception 'Wi-Fi revocation not logged';
	end if;

	v_place := pg_temp.place(v_city, 'revoke-long');
	perform public.pick_place(v_place, 'desk check');
	for i in 1..3 loop perform pg_temp.vote(v_place, p_long => case when i = 1 then 'welcome' else 'not_really' end::public.long_stays, p_days => 10); end loop;
	if public.recompute_place_certification(v_place) <> 'community' then raise exception 'Long stays Not really not revoked'; end if;
	if not exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'revoked' and reason = 'long_stays_not_really') then
		raise exception 'Long stays revocation not logged';
	end if;

	-- ---------------------------------------------------------------------------
	-- Unpick, notice, block, unblock
	-- ---------------------------------------------------------------------------

	-- Picked without contributions: back to osm_only, with the notice.
	v_place := pg_temp.place(v_city, 'unpick-notice');
	perform public.pick_place(v_place, 'desk check');
	v_text := pg_temp.error_of(format('select public.unpick_place(%L, %L)', v_place, ''));
	if v_text <> 'reason_required' then raise exception 'empty reason: %', v_text; end if;
	v_json := public.unpick_place(v_place, 'picked by mistake');
	if v_json ->> 'level' <> 'osm_only' or (v_json ->> 'blocked')::boolean or not (v_json ->> 'notice')::boolean then
		raise exception 'unpick: %', v_json;
	end if;
	select * into v_row from public.places where id = v_place;
	if not v_row.revoked_notice or v_row.auto_cert_blocked then raise exception 'unpick state'; end if;
	if not exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'unpicked' and reason = 'picked by mistake' and actor = 'command' and shows_notice) then
		raise exception 'unpick not logged';
	end if;
	-- Picked again: the notice disappears.
	perform public.pick_place(v_place, 'desk check');
	if (select revoked_at from public.places where id = v_place) is not null then raise exception 'notice kept after a new pick'; end if;

	-- --no-notice.
	v_json := public.unpick_place(v_place, 'owner asked', p_notice => false);
	if (select revoked_notice from public.places where id = v_place) then raise exception 'no-notice shows the notice'; end if;
	if exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'unpicked' and reason = 'owner asked' and shows_notice) then
		raise exception 'no-notice logged with a notice';
	end if;

	-- Picked with --block: no automatic certification even with the conditions met.
	v_place := pg_temp.place(v_city, 'unpick-block');
	perform public.pick_place(v_place, 'desk check');
	v_json := public.unpick_place(v_place, 'owner asked', p_block => true);
	if not (v_json ->> 'blocked')::boolean then raise exception 'unpick --block: %', v_json; end if;
	perform pg_temp.crowd(v_place, 10);
	if public.recompute_place_certification(v_place) = 'certified' then raise exception 'blocked place certified'; end if;
	if (select can_get_certified from public.place_details where id = v_place) then raise exception 'place_details: blocked place can get certified'; end if;
	if not exists (select 1 from public.place_level_changes where place_id = v_place and kind = 'blocked') then
		raise exception 'block not logged';
	end if;
	v_text := pg_temp.error_of(format('select public.unblock_place(%L, %L)', v_place, ''));
	if v_text <> 'reason_required' then raise exception 'unblock without reason: %', v_text; end if;
	v_json := public.unblock_place(v_place, 'owner changed their mind');
	if v_json ->> 'level' <> 'certified' then raise exception 'unblock did not recompute: %', v_json; end if;
	if (select cert_origin from public.places where id = v_place) <> 'confirmed'
		or (select removed_on from public.place_details where id = v_place) is not null then
		raise exception 'after unblock: confirmed without notice expected';
	end if;
	v_text := pg_temp.error_of(format('select public.unblock_place(%L, %L)', v_place, 'again'));
	if v_text <> 'not_blocked' then raise exception 'unblock of a free place: %', v_text; end if;

	-- Confirmed: always blocked, does not come back at the next recompute.
	v_json := public.unpick_place(v_place, 'laptops banned now');
	if not (v_json ->> 'blocked')::boolean or v_json ->> 'level' <> 'community' then raise exception 'unpick of confirmed: %', v_json; end if;
	perform public.recompute_city_certification(v_city);
	if (select level from public.places where id = v_place) = 'certified' then raise exception 'unpicked confirmed came back'; end if;
	v_text := pg_temp.error_of(format('select public.unpick_place(%L, %L)', v_place, 'again'));
	if v_text <> 'not_certified' then raise exception 'unpick of a community place: %', v_text; end if;

	-- Lists for the command.
	select count(*) into v_count from public.certification_list(v_city) where blocked;
	if v_count <> 1 then raise exception 'certification_list blocked: %', v_count; end if;
	select count(*) into v_count from public.certification_recent(v_city) where kind = 'revoked';
	if v_count <> 3 then raise exception 'certification_recent revoked: %', v_count; end if;

	-- ---------------------------------------------------------------------------
	-- No direct access for the app
	-- ---------------------------------------------------------------------------

	perform pg_temp.as_user(v_user);
	set local role authenticated;
	begin
		perform 1 from public.place_level_changes limit 1;
		raise exception 'authenticated reads place_level_changes';
	exception when insufficient_privilege then null;
	end;
	begin
		perform certified_at from public.places limit 1;
		raise exception 'authenticated reads places.certified_at';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.recompute_place_certification(v_place);
		raise exception 'authenticated recomputes';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.certification_check(v_place);
		raise exception 'authenticated reads certification_check';
	exception when insufficient_privilege then null;
	end;
	reset role;

	perform pg_temp.as_user(null);
	set local role anon;
	begin
		perform public.pick_place(v_place, 'desk check');
		raise exception 'anon calls pick_place';
	exception when insufficient_privilege then null;
	end;
	begin
		perform 1 from public.counted_contributions limit 1;
		raise exception 'anon reads counted_contributions';
	exception when insufficient_privilege then null;
	end;
	begin
		perform revoked_at from public.places limit 1;
		raise exception 'anon reads places.revoked_at';
	exception when insufficient_privilege then null;
	end;
	perform 1 from public.place_details where id = v_place;
	reset role;
end;
$$;

select 'certification: ok' as result;

rollback;
