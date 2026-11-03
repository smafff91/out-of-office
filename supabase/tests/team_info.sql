-- Team info on picked places (feature 8b). Changes nothing: everything runs inside a
-- transaction that is rolled back, on a temporary city.
--   npx supabase db query --linked -f supabase/tests/team_info.sql
-- (also run by `npm run test:db`). Any failed check raises an error; the last line prints
-- "team_info: ok".

begin;

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

create function pg_temp.place(p_city uuid, p_slug text)
returns uuid
language sql
as $$
	insert into public.places (city_id, slug, name, geom)
	values (p_city, p_slug, p_slug, extensions.st_setsrid(extensions.st_makepoint(2.17, 41.39), 4326))
	returning id;
$$;

-- One contribution written straight into the table (a deleted account: no user, random key).
create function pg_temp.vote(
	p_place uuid,
	p_wifi public.wifi_level default 'slow',
	p_rules public.laptop_rule[] default null,
	p_extras public.place_extra[] default '{}',
	p_note text default null
)
returns uuid
language sql
as $$
	insert into public.contributions (
		place_id, anon_key, would_work_again, wifi, outlets, noise, long_stays, laptop_rules, extras,
		note, checked_in
	)
	values (
		p_place, gen_random_uuid(), true, p_wifi, 'none', 'noisy', 'not_really', p_rules, p_extras,
		p_note, true
	)
	returning id;
$$;

create function pg_temp.details(p_place uuid)
returns public.place_details
language sql
as $$
	select * from public.place_details where id = p_place;
$$;

create function pg_temp.list_item(p_place uuid)
returns public.place_list_items
language sql
as $$
	select li.* from public.place_list_items li
	join public.places p on p.city_id = li.city_id and p.slug = li.slug
	where p.id = p_place;
$$;

do $$
declare
	v_city uuid := gen_random_uuid();
	v_user uuid := gen_random_uuid();
	v_place uuid;
	v_other uuid;
	v_info jsonb := jsonb_build_object(
		'wifi', 'available',
		'outlets', 'plenty',
		'noise', 'quiet',
		'long_stays', 'welcome',
		'laptop_rules', jsonb_build_array('no_laptops_weekends'),
		'extras', jsonb_build_array('large_tables', 'toilet'),
		'note', 'Work area upstairs.'
	);
	v_details public.place_details;
	v_item public.place_list_items;
	v_before jsonb;
	v_text text;
	v_count integer;
begin
	insert into public.cities (id, slug, name, country_code, timezone, center, bbox)
	values (
		v_city, 'zz-test-team-info', 'Test city', 'ES', 'Europe/Madrid',
		extensions.st_setsrid(extensions.st_makepoint(2.17, 41.39), 4326),
		extensions.st_makeenvelope(2.1, 41.3, 2.3, 41.5, 4326)
	);
	insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
	values (v_user, 'team-info-user@test.invalid', now(), '{}');

	v_place := pg_temp.place(v_city, 'picked');
	perform pg_temp.as_service();

	-- ---------------------------------------------------------------------------
	-- Saving: created, unchanged, updated; invalid values refused
	-- ---------------------------------------------------------------------------

	if public.set_place_team_info(v_place, v_info, '2026-10-17') <> 'created' then
		raise exception 'first save is not created';
	end if;
	if public.set_place_team_info(v_place, v_info, '2026-10-01') <> 'unchanged' then
		raise exception 'same info, same month is not unchanged';
	end if;
	if public.set_place_team_info(v_place, v_info || '{"note":"Work area upstairs. "}', '2026-10-01') <> 'unchanged' then
		raise exception 'trailing spaces in the note count as a change';
	end if;
	if (select checked_month from public.place_team_info where place_id = v_place) <> '2026-10-01' then
		raise exception 'checked_month is not the first day of the month';
	end if;
	begin
		perform public.set_place_team_info(v_place, v_info || '{"wifi":"none"}', '2026-10-01');
		raise exception 'wifi none accepted';
	exception when sqlstate '22023' then null;
	end;
	begin
		perform public.set_place_team_info(v_place, v_info || '{"laptop_rules":["time_limit"]}', '2026-10-01');
		raise exception 'time_limit accepted';
	exception when sqlstate '22023' then null;
	end;
	begin
		perform public.set_place_team_info(v_place, v_info || '{"outlets":"lots"}', '2026-10-01');
		raise exception 'outlets lots accepted';
	exception when sqlstate '22023' then null;
	end;
	begin
		perform public.set_place_team_info(v_place, v_info || jsonb_build_object('note', repeat('x', 141)), '2026-10-01');
		raise exception 'note of 141 characters accepted';
	exception when sqlstate '22023' then null;
	end;
	begin
		perform public.set_place_team_info(v_place, v_info, (now() + interval '2 months')::date);
		raise exception 'future month accepted';
	exception when sqlstate '22023' then null;
	end;

	-- ---------------------------------------------------------------------------
	-- Not certified: nothing of the team anywhere
	-- ---------------------------------------------------------------------------

	v_details := pg_temp.details(v_place);
	if v_details.attributes <> '{}'::jsonb or v_details.laptop_rules <> '[]'::jsonb or v_details.extras <> '[]'::jsonb then
		raise exception 'team info shown on a place that is not certified: %', row_to_json(v_details);
	end if;
	if exists (select 1 from public.place_notes where place_id = v_place) then
		raise exception 'team note shown on a place that is not certified';
	end if;

	-- ---------------------------------------------------------------------------
	-- Picked with the month of the file: certified_at on the 1st, the log at the real time
	-- ---------------------------------------------------------------------------

	v_before := public.certification_check(v_place);
	perform public.pick_place(v_place, 'desk check', '2026-10-20');
	if (select certified_at from public.places where id = v_place)
		<> ('2026-10-01'::timestamp at time zone 'Europe/Madrid') then
		raise exception 'certified_at is not the first of the month: %', (select certified_at from public.places where id = v_place);
	end if;
	if (select created_at from public.place_level_changes where place_id = v_place and kind = 'picked')
		<> now() then
		raise exception 'the pick is not logged at the real time';
	end if;
	if (pg_temp.details(v_place)).certified_on <> '2026-10-01' then
		raise exception 'certified_on is not the month of the file';
	end if;
	begin
		perform public.pick_place(v_place, 'desk check', (now() + interval '2 months')::date);
		raise exception 'pick in a future month accepted';
	exception when sqlstate '22023' then null;
	end;

	-- The team's info never counts: same check with and without it.
	if public.certification_check(v_place) <> v_before then
		raise exception 'certification_check changed with team info: % → %', v_before, public.certification_check(v_place);
	end if;

	-- ---------------------------------------------------------------------------
	-- Certified, no contributions: every team value, with its month
	-- ---------------------------------------------------------------------------

	v_details := pg_temp.details(v_place);
	if v_details.attributes <> jsonb_build_object(
		'wifi', jsonb_build_object('value', 'available', 'source', 'team', 'month', '2026-10'),
		'outlets', jsonb_build_object('value', 'plenty', 'source', 'team', 'month', '2026-10'),
		'noise', jsonb_build_object('value', 'quiet', 'source', 'team', 'month', '2026-10'),
		'long_stays', jsonb_build_object('value', 'welcome', 'source', 'team', 'month', '2026-10')
	) then
		raise exception 'team attributes: %', v_details.attributes;
	end if;
	if v_details.laptop_rules <> '[{"rule":"no_laptops_weekends","source":"team","month":"2026-10"}]'::jsonb then
		raise exception 'team laptop rules: %', v_details.laptop_rules;
	end if;
	if v_details.extras <> '[{"extra":"toilet","source":"team","month":"2026-10"},{"extra":"large_tables","source":"team","month":"2026-10"}]'::jsonb
		and v_details.extras <> '[{"extra":"large_tables","source":"team","month":"2026-10"},{"extra":"toilet","source":"team","month":"2026-10"}]'::jsonb then
		raise exception 'team extras: %', v_details.extras;
	end if;
	if v_details.votes <> 0 or v_details.contributors <> 0 or v_details.score_pct is not null then
		raise exception 'team info counted as votes or users';
	end if;
	if (select count(*) from public.place_notes where place_id = v_place and from_team and created_month = '2026-10') <> 1 then
		raise exception 'team note missing from place_notes';
	end if;
	if exists (select 1 from public.place_contributors where place_id = v_place) then
		raise exception 'the team appears in place_contributors';
	end if;
	v_item := pg_temp.list_item(v_place);
	if v_item.wifi <> 'available' or v_item.outlets <> 'plenty' or v_item.noise <> 'quiet'
		or v_item.laptop_rules <> array['no_laptops_weekends'] or v_item.votes is not null then
		raise exception 'team values in the list: %', row_to_json(v_item);
	end if;

	-- ---------------------------------------------------------------------------
	-- Precedence: a contribution without laptop rules or extras
	-- ---------------------------------------------------------------------------

	perform pg_temp.vote(v_place, p_note => 'Fine.');
	v_details := pg_temp.details(v_place);
	if v_details.attributes -> 'wifi' ->> 'value' <> 'slow'
		or v_details.attributes -> 'wifi' ->> 'source' <> 'users'
		or v_details.attributes -> 'outlets' ->> 'value' <> 'none'
		or v_details.attributes -> 'noise' ->> 'value' <> 'noisy'
		or v_details.attributes -> 'long_stays' ->> 'value' <> 'not_really' then
		raise exception 'community does not win the main attributes: %', v_details.attributes;
	end if;
	if v_details.laptop_rules -> 0 ->> 'source' <> 'team' then
		raise exception 'team laptop rules hidden before anyone answered: %', v_details.laptop_rules;
	end if;
	if jsonb_array_length(v_details.extras) <> 2 then
		raise exception 'team extras hidden before anyone mentioned them: %', v_details.extras;
	end if;
	v_item := pg_temp.list_item(v_place);
	if v_item.wifi <> 'slow' or v_item.laptop_rules <> array['no_laptops_weekends'] then
		raise exception 'list precedence: %', row_to_json(v_item);
	end if;
	if (select count(*) from public.place_notes where place_id = v_place) <> 2 then
		raise exception 'team note and community note not both shown';
	end if;

	-- Laptop rules: the community answers "No rules" → the team's rules go, even though the
	-- community shows none.
	perform pg_temp.vote(v_place, p_rules => array['none']::public.laptop_rule[]);
	v_details := pg_temp.details(v_place);
	if v_details.laptop_rules <> '[]'::jsonb then
		raise exception 'team laptop rules shown after the community answered: %', v_details.laptop_rules;
	end if;
	if (pg_temp.list_item(v_place)).laptop_rules is not null then
		raise exception 'team laptop rules in the list after the community answered';
	end if;

	-- Extras chip by chip: the community mentions toilet → toilet from users, large_tables from the team.
	perform pg_temp.vote(v_place, p_extras => array['toilet']::public.place_extra[]);
	v_details := pg_temp.details(v_place);
	if (select count(*) from jsonb_array_elements(v_details.extras) e
		where e ->> 'extra' = 'toilet' and e ->> 'source' = 'users' and (e ->> 'confirmations')::integer = 1) <> 1
		or (select count(*) from jsonb_array_elements(v_details.extras) e
			where e ->> 'extra' = 'large_tables' and e ->> 'source' = 'team') <> 1
		or jsonb_array_length(v_details.extras) <> 2 then
		raise exception 'extras chip by chip: %', v_details.extras;
	end if;

	-- ---------------------------------------------------------------------------
	-- Unpicked: saved, but nothing of the team in the details, the list or the notes
	-- ---------------------------------------------------------------------------

	v_other := pg_temp.place(v_city, 'unpicked');
	perform public.set_place_team_info(v_other, v_info, '2026-10-01');
	perform public.pick_place(v_other, 'desk check', '2026-10-01');
	perform public.unpick_place(v_other, 'test', false, false);
	v_details := pg_temp.details(v_other);
	if v_details is not null
		and (v_details.attributes <> '{}'::jsonb or v_details.laptop_rules <> '[]'::jsonb or v_details.extras <> '[]'::jsonb) then
		raise exception 'team info shown after unpick: %', row_to_json(v_details);
	end if;
	v_item := pg_temp.list_item(v_other);
	if v_item is not null and (v_item.wifi is not null or v_item.outlets is not null or v_item.noise is not null
		or v_item.laptop_rules is not null) then
		raise exception 'team values in the list after unpick: %', row_to_json(v_item);
	end if;
	if exists (select 1 from public.place_notes where place_id = v_other) then
		raise exception 'team note shown after unpick';
	end if;
	if not exists (select 1 from public.place_team_info where place_id = v_other) then
		raise exception 'team info deleted by unpick';
	end if;

	-- ---------------------------------------------------------------------------
	-- Who may read and write
	-- ---------------------------------------------------------------------------

	perform pg_temp.as_user(v_user);
	set local role authenticated;
	begin
		perform 1 from public.place_team_info limit 1;
		raise exception 'authenticated reads place_team_info';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.set_place_team_info(v_place, v_info, '2026-10-01');
		raise exception 'a user who is not an admin saves team info';
	exception when insufficient_privilege then null;
	end;
	reset role;

	perform pg_temp.as_user(null);
	set local role anon;
	begin
		perform 1 from public.place_team_info limit 1;
		raise exception 'anon reads place_team_info';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.set_place_team_info(v_place, v_info, '2026-10-01');
		raise exception 'anon calls set_place_team_info';
	exception when insufficient_privilege then null;
	end;
	perform 1 from public.place_notes where place_id = v_place;
	reset role;
end;
$$;

select 'team_info: ok' as result;

rollback;
