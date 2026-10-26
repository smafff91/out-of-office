-- Contribution rules (feature 7b). Changes nothing: everything runs inside a transaction that is
-- rolled back, on a temporary city with its own settings (Founding limit 2).
--   npx supabase db query --linked -f supabase/tests/contributions.sql
-- (also run by `npm run test:db`). Any failed check raises an error; the last line prints
-- "contributions: ok".

begin;

-- submit_contribution() as a given user (auth.uid() reads the JWT claims).
create function pg_temp.submit(
	p_user uuid,
	p_place uuid,
	p_wifi public.wifi_level default 'fast',
	p_rules public.laptop_rule[] default null,
	p_hours smallint default null,
	p_extras public.place_extra[] default null,
	p_note text default null,
	p_lat double precision default null,
	p_lng double precision default null,
	p_accuracy double precision default null
)
returns jsonb
language plpgsql
as $$
begin
	perform set_config(
		'request.jwt.claims',
		case when p_user is null then '{}' else json_build_object('sub', p_user, 'role', 'authenticated')::text end,
		true
	);
	return public.submit_contribution(
		p_place_id => p_place,
		p_would_work_again => true,
		p_wifi => p_wifi,
		p_outlets => 'plenty',
		p_noise => 'quiet',
		p_long_stays => 'welcome',
		p_laptop_rules => p_rules,
		p_time_limit_hours => p_hours,
		p_extras => p_extras,
		p_note => p_note,
		p_lat => p_lat,
		p_lng => p_lng,
		p_accuracy => p_accuracy
	);
end;
$$;

-- The error message of a submission, or 'ok'.
create function pg_temp.error_of(
	p_user uuid,
	p_place uuid,
	p_rules public.laptop_rule[] default null,
	p_note text default null
)
returns text
language plpgsql
as $$
begin
	perform pg_temp.submit(p_user, p_place, p_rules => p_rules, p_note => p_note);
	return 'ok';
exception when others then
	return sqlerrm;
end;
$$;

-- A point at a given distance north of a place, as (lat, lng).
create function pg_temp.north_of(p_place uuid, p_meters double precision)
returns table (lat double precision, lng double precision)
language sql
as $$
	select extensions.st_y(g::extensions.geometry), extensions.st_x(g::extensions.geometry)
	from (
		select extensions.st_project(p.geom::extensions.geography, p_meters, 0) as g
		from public.places p where p.id = p_place
	) s;
$$;

do $$
declare
	v_city uuid := gen_random_uuid();
	v_a uuid := gen_random_uuid();
	v_b uuid := gen_random_uuid();
	u1 uuid := gen_random_uuid();
	u2 uuid := gen_random_uuid();
	u3 uuid := gen_random_uuid();
	u4 uuid := gen_random_uuid();
	u5 uuid := gen_random_uuid();
	u6 uuid := gen_random_uuid();
	v_unconfirmed uuid := gen_random_uuid();
	v_result jsonb;
	v_lat double precision;
	v_lng double precision;
	v_count integer;
	v_text text;
	v_json jsonb;
begin
	insert into public.cities (id, slug, name, country_code, timezone, center, bbox)
	values (
		v_city, 'zz-test-contributions', 'Test city', 'ES', 'Europe/Madrid',
		extensions.st_setsrid(extensions.st_makepoint(2.17, 41.39), 4326),
		extensions.st_makeenvelope(2.1, 41.3, 2.3, 41.5, 4326)
	);
	insert into public.places (id, city_id, slug, name, geom) values
		(v_a, v_city, 'place-a', 'Place A', extensions.st_setsrid(extensions.st_makepoint(2.17, 41.39), 4326)),
		(v_b, v_city, 'place-b', 'Place B', extensions.st_setsrid(extensions.st_makepoint(2.18, 41.40), 4326));
	insert into public.certification_settings (
		city_id, min_users, min_checkin_ratio, min_span_days, min_score, revoke_below_score,
		revoke_min_votes, revoke_window_months, review_reports_count, review_reports_window_days,
		manual_recheck_months, vote_cooldown_days, checkin_radius_m, score_min_votes,
		checkin_max_accuracy_m, daily_contribution_limit, founding_limit
	)
	values (v_city, 10, 0.50, 14, 0.75, 0.60, 10, 12, 2, 30, 12, 30, 100, 5, 100, 20, 2);

	insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
		(u1, 'u1@test.invalid', now(), '{}'),
		(u2, 'u2@test.invalid', now(), '{}'),
		(u3, 'u3@test.invalid', now(), '{}'),
		(u4, 'u4@test.invalid', now(), '{}'),
		(u5, 'u5@test.invalid', now(), '{}'),
		(u6, 'u6@test.invalid', now(), '{}'),
		(v_unconfirmed, 'unconfirmed@test.invalid', null, '{}');

	-- ---------------------------------------------------------------------------
	-- Check-in: 100 m and declared accuracy ≤ 100 m, decided here
	-- ---------------------------------------------------------------------------

	select lat, lng into v_lat, v_lng from pg_temp.north_of(v_a, 99);
	v_result := pg_temp.submit(u1, v_a, p_extras => '{air_conditioning}', p_lat => v_lat, p_lng => v_lng, p_accuracy => 100);
	if (v_result ->> 'verified')::boolean is not true then raise exception '99 m, accuracy 100: not verified'; end if;
	if (v_result ->> 'replaced')::boolean then raise exception 'first contribution marked as replaced'; end if;
	if (v_result ->> 'founding')::boolean is not true then raise exception 'first user of the city: no Founding seat'; end if;
	if v_result ->> 'level' <> 'community' then raise exception 'place did not become community: %', v_result ->> 'level'; end if;

	v_result := pg_temp.submit(u1, v_a, p_lat => v_lat, p_lng => v_lng, p_accuracy => 101);
	if (v_result ->> 'verified')::boolean then raise exception 'accuracy 101 verified'; end if;
	if (v_result ->> 'replaced')::boolean is not true then raise exception 'replacement within 30 days not reported'; end if;
	if (v_result ->> 'founding')::boolean then raise exception 'Founding seat given twice'; end if;

	select lat, lng into v_lat, v_lng from pg_temp.north_of(v_a, 101);
	v_result := pg_temp.submit(u1, v_a, p_lat => v_lat, p_lng => v_lng, p_accuracy => 5);
	if (v_result ->> 'verified')::boolean then raise exception '101 m verified'; end if;

	select lat, lng into v_lat, v_lng from pg_temp.north_of(v_a, 10);
	v_result := pg_temp.submit(u1, v_a);
	if (v_result ->> 'verified')::boolean then raise exception 'no coordinates verified'; end if;
	v_result := pg_temp.submit(u1, v_a, p_lat => v_lat, p_lng => v_lng);
	if (v_result ->> 'verified')::boolean then raise exception 'coordinates without accuracy verified'; end if;
	v_result := pg_temp.submit(u1, v_a, p_lat => v_lat, p_lng => v_lng, p_accuracy => -1);
	if (v_result ->> 'verified')::boolean then raise exception 'negative accuracy verified'; end if;
	v_result := pg_temp.submit(u1, v_a, p_lat => v_lat, p_lng => v_lng, p_accuracy => 'NaN');
	if (v_result ->> 'verified')::boolean then raise exception 'NaN accuracy verified'; end if;
	v_result := pg_temp.submit(u1, v_a, p_lat => 91, p_lng => v_lng, p_accuracy => 5);
	if (v_result ->> 'verified')::boolean then raise exception 'latitude out of range verified'; end if;
	v_result := pg_temp.submit(u1, v_a, p_lat => 'NaN', p_lng => v_lng, p_accuracy => 5);
	if (v_result ->> 'verified')::boolean then raise exception 'NaN latitude verified'; end if;

	-- Last one: verified, with a detail.
	v_result := pg_temp.submit(u1, v_a, p_wifi => 'slow', p_extras => '{toilet}', p_lat => v_lat, p_lng => v_lng, p_accuracy => 20);
	if (v_result ->> 'verified')::boolean is not true then raise exception '10 m, accuracy 20: not verified'; end if;
	if (v_result -> 'confirmations' ->> 'wifi')::integer <> 1 then raise exception 'confirmations: got %', v_result -> 'confirmations'; end if;

	-- History kept, one active contribution, counted once.
	select count(*) into v_count from public.contributions where user_id = u1 and place_id = v_a;
	if v_count <> 10 then raise exception 'history: % rows, expected 10', v_count; end if;
	select count(*) into v_count from public.contributions where user_id = u1 and place_id = v_a and superseded_at is null;
	if v_count <> 1 then raise exception 'active: % rows, expected 1', v_count; end if;
	select count(*) into v_count from public.contributions
	where user_id = u1 and place_id = v_a and superseded_at is not null and superseded_by is null;
	if v_count <> 0 then raise exception '% superseded rows without superseded_by', v_count; end if;
	select count(*) into v_count from public.contributions where user_id = u1 and city_id = v_city;
	if v_count <> 10 then raise exception 'city_id not set by the server'; end if;
	select votes into v_count from public.place_scores where place_id = v_a;
	if v_count <> 1 then raise exception 'place_scores counts % votes, expected 1', v_count; end if;
	select value || ':' || confirmations into v_text from public.place_attributes where place_id = v_a and attribute = 'wifi';
	if v_text <> 'slow:1' then raise exception 'place_attributes wifi: got %', v_text; end if;
	select contributors into v_count from public.place_details where id = v_a;
	if v_count <> 1 then raise exception 'place_details contributors: %', v_count; end if;

	-- Details: shown when one active contribution mentions them; superseded ones do not count.
	select extras into v_json from public.place_details where id = v_a;
	if v_json <> jsonb_build_array(jsonb_build_object('extra', 'toilet', 'confirmations', 1,
		'last_confirmed_on', (now() at time zone 'Europe/Madrid')::date)) then
		raise exception 'place_details extras: got %', v_json;
	end if;

	-- ---------------------------------------------------------------------------
	-- After 30 days: the old contribution also goes to the history
	-- ---------------------------------------------------------------------------

	v_result := pg_temp.submit(u2, v_b);
	if (v_result ->> 'founding')::boolean is not true then raise exception 'second user: no Founding seat'; end if;
	update public.contributions set created_at = now() - interval '31 days' where user_id = u2 and place_id = v_b;
	v_result := pg_temp.submit(u2, v_b);
	if (v_result ->> 'replaced')::boolean then raise exception 'contribution older than 30 days reported as replaced'; end if;
	select count(*) filter (where superseded_at is null), count(*) into v_count, v_text
	from public.contributions where user_id = u2 and place_id = v_b;
	if v_count <> 1 or v_text <> '2' then raise exception 'after 30 days: % active of %', v_count, v_text; end if;
	select votes into v_count from public.place_scores where place_id = v_b;
	if v_count <> 1 then raise exception 'after 30 days: % votes, expected 1', v_count; end if;

	-- ---------------------------------------------------------------------------
	-- Daily limit (20 per account, replacements included); Founding limit reached
	-- ---------------------------------------------------------------------------

	for i in 1..20 loop
		v_result := pg_temp.submit(u3, v_a);
		if i = 1 and (v_result ->> 'founding')::boolean then raise exception 'Founding seat beyond the limit'; end if;
	end loop;
	v_text := pg_temp.error_of(u3, v_b);
	if v_text <> 'daily_limit' then raise exception '21st submission: got %', v_text; end if;

	-- ---------------------------------------------------------------------------
	-- Laptop rules, note, refusals
	-- ---------------------------------------------------------------------------

	v_text := pg_temp.error_of(u4, v_b, p_rules => '{none,time_limit}');
	if v_text <> 'invalid_laptop_rules' then raise exception 'No rules + Time limit: got %', v_text; end if;
	v_text := pg_temp.error_of(u4, v_b, p_note => repeat('a', 141));
	if v_text <> 'note_too_long' then raise exception '141-character note: got %', v_text; end if;
	v_text := pg_temp.error_of(v_unconfirmed, v_b);
	if v_text <> 'email_not_confirmed' then raise exception 'unconfirmed account: got %', v_text; end if;
	v_text := pg_temp.error_of(null, v_b);
	if v_text <> 'not_signed_in' then raise exception 'no user: got %', v_text; end if;
	v_text := pg_temp.error_of(u4, gen_random_uuid());
	if v_text <> 'place_not_found' then raise exception 'unknown place: got %', v_text; end if;

	perform pg_temp.submit(u4, v_b, p_rules => '{no_laptops_lunch,no_laptops_lunch}', p_hours => 2::smallint, p_note => '  Upstairs  ');
	select array_to_string(laptop_rules, ',') || '|' || coalesce(time_limit_hours::text, '-') || '|' || note into v_text
	from public.contributions where user_id = u4 and superseded_at is null;
	if v_text <> 'no_laptops_lunch|-|Upstairs' then raise exception 'normalization: got %', v_text; end if;
	perform pg_temp.submit(u5, v_b, p_rules => '{time_limit}', p_hours => 2::smallint);
	select r -> 'hours' into v_json
	from public.place_details d, jsonb_array_elements(d.laptop_rules) r
	where d.id = v_b and r ->> 'rule' = 'time_limit';
	if v_json is distinct from '2'::jsonb then raise exception 'time limit hours: got %', v_json; end if;

	-- ---------------------------------------------------------------------------
	-- Founding: kept after replacement and after another account is deleted, never above 2
	-- ---------------------------------------------------------------------------

	select count(*) into v_count from public.founding_contributors where city_id = v_city and user_id = u1;
	if v_count <> 1 then raise exception 'Founding seat lost after replacements'; end if;
	delete from auth.users where id = u2;
	select count(*) into v_count from public.founding_contributors where city_id = v_city;
	if v_count <> 2 then raise exception 'seats after account deletion: %', v_count; end if;
	v_result := pg_temp.submit(u6, v_a);
	if (v_result ->> 'founding')::boolean then raise exception 'freed seat given again'; end if;
	select count(*) into v_count from public.founding_contributors where city_id = v_city;
	if v_count <> 2 then raise exception 'seats: %, expected 2', v_count; end if;
	if public.reset_founding_contributors(v_city) <> 2 then raise exception 'reset_founding_contributors'; end if;

	-- ---------------------------------------------------------------------------
	-- RLS and grants: no direct access to contributions, history or seats
	-- ---------------------------------------------------------------------------

	perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
	set local role authenticated;

	begin
		perform 1 from public.contributions limit 1;
		raise exception 'authenticated reads contributions';
	exception when insufficient_privilege then null;
	end;
	begin
		perform 1 from public.active_contributions limit 1;
		raise exception 'authenticated reads active_contributions';
	exception when insufficient_privilege then null;
	end;
	begin
		perform 1 from public.founding_contributors limit 1;
		raise exception 'authenticated reads founding_contributors';
	exception when insufficient_privilege then null;
	end;
	begin
		insert into public.contributions (place_id, user_id, would_work_again, wifi, outlets, noise, long_stays, checked_in)
		values (v_b, u4, true, 'fast', 'plenty', 'quiet', 'welcome', true);
		raise exception 'authenticated inserts a contribution for someone else';
	exception when insufficient_privilege then null;
	end;
	begin
		update public.contributions set checked_in = true where user_id = u1;
		raise exception 'authenticated sets checked_in';
	exception when insufficient_privilege then null;
	end;
	begin
		delete from public.contributions where user_id = u1;
		raise exception 'authenticated deletes contributions';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.reset_founding_contributors(v_city);
		raise exception 'authenticated resets Founding seats';
	exception when insufficient_privilege then null;
	end;

	-- Own recent answers only.
	select count(*), max(wifi::text) into v_count, v_text from public.my_recent_contribution(v_a);
	if v_count <> 1 or v_text <> 'slow' then raise exception 'my_recent_contribution: % rows, %', v_count, v_text; end if;
	select count(*) into v_count from public.my_recent_contribution(v_b);
	if v_count <> 0 then raise exception 'my_recent_contribution returned another place'; end if;

	reset role;

	set local role anon;
	begin
		perform public.submit_contribution(v_b, true, 'fast', 'plenty', 'quiet', 'welcome');
		raise exception 'anon calls submit_contribution';
	exception when insufficient_privilege then null;
	end;
	begin
		insert into public.contributions (place_id, would_work_again, wifi, outlets, noise, long_stays)
		values (v_b, true, 'fast', 'plenty', 'quiet', 'welcome');
		raise exception 'anon inserts a contribution';
	exception when insufficient_privilege then null;
	end;
	reset role;
end;
$$;

select 'contributions: ok' as result;

rollback;
