-- Profile privacy and public names (feature 7a). Changes nothing: everything runs inside a
-- transaction that is rolled back.
--   npx supabase db query --linked -f supabase/tests/profile_visibility.sql
-- Any failed check raises an error; the last line prints "profile_visibility: ok".

begin;

do $$
declare
	v_shown uuid := gen_random_uuid();
	v_hidden uuid := gen_random_uuid();
	v_undecided uuid := gen_random_uuid();
	v_full_name uuid := gen_random_uuid();
	v_place uuid;
	v_count integer;
	v_text text;
begin
	select id into v_place from public.places where review_status = 'approved' limit 1;
	if v_place is null then raise exception 'no approved place to test with'; end if;

	-- Sign-up: Google gives a given_name, email gives nothing; the locale comes from metadata.
	-- Only given_name counts: no fallback to full_name or name.
	insert into auth.users (id, email, raw_user_meta_data) values
		(v_shown, 'shown@test.invalid', '{"given_name": "Zoe Anne", "locale": "ca"}'),
		(v_hidden, 'hidden@test.invalid', '{"given_name": "Yann", "locale": "xx"}'),
		(v_undecided, 'undecided@test.invalid', '{}'),
		(v_full_name, 'full-name@test.invalid', '{"full_name": "Wanda Smith", "name": "Wanda Smith"}');

	select display_name || '|' || coalesce(locale, '-') into v_text from public.profiles where id = v_shown;
	if v_text <> 'Zoe|ca' then raise exception 'handle_new_user: got %', v_text; end if;
	select coalesce(display_name, '-') || '|' || coalesce(locale, '-') into v_text from public.profiles where id = v_hidden;
	if v_text <> 'Yann|-' then raise exception 'handle_new_user (bad locale): got %', v_text; end if;
	select coalesce(display_name, '-') into v_text from public.profiles where id = v_undecided;
	if v_text <> '-' then raise exception 'email sign-up should have no name, got %', v_text; end if;
	select coalesce(display_name, '-') into v_text from public.profiles where id = v_full_name;
	if v_text <> '-' then raise exception 'no given_name should mean no name, got %', v_text; end if;

	update public.profiles set show_name = true where id = v_shown;
	update public.profiles set show_name = false where id = v_hidden;
	update public.profiles set display_name = 'Xavi' where id = v_undecided; -- show_name stays null

	insert into public.contributions (place_id, user_id, would_work_again, wifi, outlets, noise, long_stays, note)
	values
		(v_place, v_shown, true, 'fast', 'plenty', 'quiet', 'welcome', 'Great'),
		(v_place, v_hidden, true, 'fast', 'plenty', 'quiet', 'welcome', null),
		(v_place, v_undecided, true, 'fast', 'plenty', 'quiet', 'welcome', null);

	-- Only the name of the person who chose to show it.
	select string_agg(display_name, ',' order by display_name) into v_text
	from public.place_contributors
	where place_id = v_place and display_name in ('Zoe', 'Yann', 'Xavi');
	if v_text is distinct from 'Zoe' then raise exception 'place_contributors: got %', v_text; end if;

	-- Notes: month only.
	select created_month into v_text from public.place_notes where place_id = v_place and note = 'Great';
	if v_text !~ '^\d{4}-\d{2}$' then raise exception 'place_notes month: got %', v_text; end if;

	-- The locale reaches the email template's metadata.
	update public.profiles set locale = 'es' where id = v_hidden;
	select raw_user_meta_data ->> 'locale' into v_text from auth.users where id = v_hidden;
	if v_text is distinct from 'es' then raise exception 'sync_profile_locale: got %', v_text; end if;

	-- Constraint: 30 characters, no email.
	begin
		update public.profiles set display_name = repeat('a', 31) where id = v_shown;
		raise exception 'a 31-character name was accepted';
	exception when check_violation then null;
	end;
	begin
		update public.profiles set display_name = 'zoe@example.com' where id = v_shown;
		raise exception 'an email as name was accepted';
	exception when check_violation then null;
	end;

	-- As the signed-in user v_shown: own profile only.
	perform set_config('request.jwt.claims', json_build_object('sub', v_shown, 'role', 'authenticated')::text, true);
	set local role authenticated;

	select count(*) into v_count from public.profiles;
	if v_count <> 1 then raise exception 'authenticated sees % profiles, expected 1', v_count; end if;

	update public.profiles set display_name = 'Hacked' where id = v_hidden;
	get diagnostics v_count = row_count;
	if v_count <> 0 then raise exception 'updated someone else''s profile'; end if;

	update public.profiles set display_name = 'Zoë' where id = v_shown;
	get diagnostics v_count = row_count;
	if v_count <> 1 then raise exception 'could not update own profile'; end if;

	begin
		update public.profiles set role = 'admin' where id = v_shown;
		raise exception 'role is writable';
	exception when insufficient_privilege then null;
	end;

	reset role;

	-- Anonymous visitors: no profile at all.
	set local role anon;
	begin
		perform 1 from public.profiles limit 1;
		raise exception 'anon can read profiles';
	exception when insufficient_privilege then null;
	end;
	reset role;

	-- Account deletion (GDPR): profile, metadata and notes go; votes stay anonymous.
	delete from auth.users where id = v_shown;
	select count(*) into v_count from public.profiles where id = v_shown;
	if v_count <> 0 then raise exception 'profile left after deletion'; end if;
	select count(*) into v_count from public.place_notes where place_id = v_place and note = 'Great';
	if v_count <> 0 then raise exception 'note left after deletion'; end if;
	select count(*) into v_count from public.place_contributors where place_id = v_place and display_name in ('Zoe', 'Zoë');
	if v_count <> 0 then raise exception 'name left after deletion'; end if;
	select count(*) into v_count from public.contributions where place_id = v_place and user_id is null and anon_key is not null;
	if v_count < 1 then raise exception 'vote not kept anonymously'; end if;
end;
$$;

select 'profile_visibility: ok' as result;

rollback;
