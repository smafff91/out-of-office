-- Photo rules (feature 7c). Changes nothing: everything runs inside a transaction that is rolled
-- back, on a temporary city. Real uploads (bucket rules, file deletion) are in
-- tests/db/photos.check.ts: the Storage API cannot run inside a transaction.
--   npx supabase db query --linked -f supabase/tests/photos.sql
-- (also run by `npm run test:db`). Any failed check raises an error; the last line prints
-- "photos: ok".

begin;

create function pg_temp.as_user(p_user uuid)
returns void
language sql
as $$
	select set_config(
		'request.jwt.claims',
		case when p_user is null then '{}' else json_build_object('sub', p_user, 'role', 'authenticated')::text end,
		true
	);
$$;

create function pg_temp.submit(p_user uuid, p_place uuid)
returns jsonb
language plpgsql
as $$
begin
	perform pg_temp.as_user(p_user);
	return public.submit_contribution(p_place, true, 'fast', 'plenty', 'quiet', 'welcome');
end;
$$;

create function pg_temp.reserve(
	p_user uuid,
	p_contribution uuid,
	p_width integer default 1200,
	p_height integer default 900
)
returns uuid
language plpgsql
as $$
begin
	perform pg_temp.as_user(p_user);
	return (public.reserve_photo(p_contribution, p_width, p_height, '2026-10-29') ->> 'id')::uuid;
end;
$$;

-- The error message of a booking, or 'ok'.
create function pg_temp.reserve_error(
	p_user uuid,
	p_contribution uuid,
	p_width integer default 1200,
	p_height integer default 900
)
returns text
language plpgsql
as $$
begin
	perform pg_temp.reserve(p_user, p_contribution, p_width, p_height);
	return 'ok';
exception when others then
	return sqlerrm;
end;
$$;

-- What publish_photo() does once both files are there (the files are tested in photos.check.ts).
create function pg_temp.publish(p_photo uuid)
returns void
language sql
as $$
	update public.photos set published_at = clock_timestamp() where id = p_photo;
$$;

create function pg_temp.queued(p_photo uuid)
returns integer
language sql
as $$
	select count(*)::integer from public.storage_deletions d
	where d.name = p_photo::text || '.webp'
		and d.bucket_id in ('place-photos', 'place-photo-thumbs');
$$;

do $$
declare
	v_city uuid := gen_random_uuid();
	v_places uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
		gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
	v_a uuid;
	u1 uuid := gen_random_uuid();
	u2 uuid := gen_random_uuid();
	v_unconfirmed uuid := gen_random_uuid();
	v_result jsonb;
	v_contribution uuid;
	v_c2 uuid;
	v_photo uuid;
	v_photos uuid[] := '{}';
	v_count integer;
	v_text text;
	v_paths text[];
begin
	v_a := v_places[1];
	insert into public.cities (id, slug, name, country_code, timezone, center, bbox)
	values (
		v_city, 'zz-test-photos', 'Test city', 'ES', 'Europe/Madrid',
		extensions.st_setsrid(extensions.st_makepoint(2.17, 41.39), 4326),
		extensions.st_makeenvelope(2.1, 41.3, 2.3, 41.5, 4326)
	);
	for i in 1..6 loop
		insert into public.places (id, city_id, slug, name, geom)
		values (v_places[i], v_city, 'place-' || i, 'Place ' || i,
			extensions.st_setsrid(extensions.st_makepoint(2.17 + i * 0.001, 41.39), 4326));
	end loop;

	insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
		(u1, 'photos-u1@test.invalid', now(), '{}'),
		(u2, 'photos-u2@test.invalid', now(), '{}'),
		(v_unconfirmed, 'photos-unconfirmed@test.invalid', null, '{}');
	update public.profiles set display_name = 'Ana', show_name = true where id = u1;
	update public.profiles set display_name = 'Bea', show_name = false where id = u2;

	-- ---------------------------------------------------------------------------
	-- submit_contribution() returns the id and the photo slots
	-- ---------------------------------------------------------------------------

	v_result := pg_temp.submit(u1, v_a);
	v_contribution := (v_result ->> 'id')::uuid;
	if v_contribution is null then raise exception 'submit_contribution: no id'; end if;
	if (v_result ->> 'photo_slots')::integer <> 3 then
		raise exception 'photo_slots: got %, expected 3', v_result ->> 'photo_slots';
	end if;

	-- ---------------------------------------------------------------------------
	-- Bookings: 3 per contribution, refusals
	-- ---------------------------------------------------------------------------

	for i in 1..3 loop
		v_photos := v_photos || pg_temp.reserve(u1, v_contribution);
	end loop;
	v_text := pg_temp.reserve_error(u1, v_contribution);
	if v_text <> 'photo_limit_contribution' then raise exception '4th photo: got %', v_text; end if;

	select storage_path into v_text from public.photos where id = v_photos[1];
	if v_text <> v_photos[1]::text || '.webp' then raise exception 'storage_path: got %', v_text; end if;
	select count(*) into v_count from public.photos
	where id = any (v_photos) and user_id = u1 and place_id = v_a and contribution_id = v_contribution
		and published_at is null and terms_version = '2026-10-29';
	if v_count <> 3 then raise exception 'booked rows: % of 3 as expected', v_count; end if;

	v_text := pg_temp.reserve_error(u2, v_contribution);
	if v_text <> 'contribution_not_found' then raise exception 'someone else''s contribution: got %', v_text; end if;
	v_text := pg_temp.reserve_error(null, v_contribution);
	if v_text <> 'not_signed_in' then raise exception 'no user: got %', v_text; end if;
	v_text := pg_temp.reserve_error(v_unconfirmed, v_contribution);
	if v_text <> 'email_not_confirmed' then raise exception 'unconfirmed account: got %', v_text; end if;

	v_c2 := (pg_temp.submit(u2, v_a) ->> 'id')::uuid;
	v_text := pg_temp.reserve_error(u2, v_c2, 1201, 900);
	if v_text <> 'invalid_photo' then raise exception '1201 px: got %', v_text; end if;
	v_text := pg_temp.reserve_error(u2, v_c2, 0, 900);
	if v_text <> 'invalid_photo' then raise exception '0 px: got %', v_text; end if;
	perform pg_temp.as_user(u2);
	begin
		perform public.reserve_photo(v_c2, 1200, 900, 'v1');
		raise exception 'terms version accepted: v1';
	exception when others then
		if sqlerrm <> 'invalid_photo' then raise; end if;
	end;

	-- A contribution older than 24 hours takes no more photos.
	update public.contributions set created_at = now() - interval '25 hours' where id = v_c2;
	v_text := pg_temp.reserve_error(u2, v_c2);
	if v_text <> 'contribution_not_found' then raise exception 'contribution of yesterday: got %', v_text; end if;
	update public.contributions set created_at = now() where id = v_c2;

	-- ---------------------------------------------------------------------------
	-- Upload rule: only the user's own booked, unpublished, recent names
	-- ---------------------------------------------------------------------------

	perform pg_temp.as_user(u1);
	if not public.can_upload_photo('place-photos', v_photos[1]::text || '.webp') then
		raise exception 'can_upload_photo: own booking refused';
	end if;
	if not public.can_upload_photo('place-photo-thumbs', v_photos[1]::text || '.webp') then
		raise exception 'can_upload_photo: own booking refused (thumbnail)';
	end if;
	if public.can_upload_photo('avatars', v_photos[1]::text || '.webp') then
		raise exception 'can_upload_photo: another bucket accepted';
	end if;
	if public.can_upload_photo('place-photos', gen_random_uuid()::text || '.webp') then
		raise exception 'can_upload_photo: name never booked accepted';
	end if;
	perform pg_temp.as_user(u2);
	if public.can_upload_photo('place-photos', v_photos[1]::text || '.webp') then
		raise exception 'can_upload_photo: someone else''s booking accepted';
	end if;

	-- publish_photo() refuses a booking without its files, and someone else's photo.
	perform pg_temp.as_user(u1);
	begin
		perform public.publish_photo(v_photos[1]);
		raise exception 'published without files';
	exception when others then
		if sqlerrm <> 'photo_files_missing' then raise; end if;
	end;
	perform pg_temp.as_user(u2);
	begin
		perform public.publish_photo(v_photos[1]);
		raise exception 'published someone else''s photo';
	exception when others then
		if sqlerrm <> 'photo_not_found' then raise; end if;
	end;

	-- ---------------------------------------------------------------------------
	-- Public views: published and visible only, credit only with show_name
	-- ---------------------------------------------------------------------------

	select count(*) into v_count from public.place_photos where place_id = v_a;
	if v_count <> 0 then raise exception 'booked photos in place_photos: %', v_count; end if;
	select photo_count into v_count from public.place_details where id = v_a;
	if v_count <> 0 then raise exception 'booked photos counted in place_details: %', v_count; end if;

	perform pg_temp.publish(v_photos[1]);
	perform pg_temp.publish(v_photos[2]);
	perform pg_temp.publish(v_photos[3]);
	perform pg_temp.as_user(u1);
	if public.can_upload_photo('place-photos', v_photos[1]::text || '.webp') then
		raise exception 'can_upload_photo: published name accepted (overwrite)';
	end if;

	v_photo := pg_temp.reserve(u2, v_c2);
	perform pg_temp.publish(v_photo);

	select count(*) into v_count from public.place_photos where place_id = v_a;
	if v_count <> 4 then raise exception 'place_photos: % rows, expected 4', v_count; end if;
	select path into v_text from public.place_photos where place_id = v_a and sort_order = 1;
	if v_text <> v_photo::text || '.webp' then raise exception 'newest photo not first: %', v_text; end if;
	select count(*) into v_count from public.place_photos where place_id = v_a and credit = 'Ana';
	if v_count <> 3 then raise exception 'credit Ana: % of 3', v_count; end if;
	select count(*) into v_count from public.place_photos where place_id = v_a and credit is not null
		and path = v_photo::text || '.webp';
	if v_count <> 0 then raise exception 'name shown without show_name'; end if;

	select cover_path into v_text from public.place_list_items where slug = 'place-1' and city_id = v_city;
	if v_text <> v_photo::text || '.webp' then raise exception 'cover_path: got %', v_text; end if;
	select photo_paths, photo_count into v_paths, v_count from public.place_details where id = v_a;
	if cardinality(v_paths) <> 3 or v_count <> 4 or v_paths[1] <> v_photo::text || '.webp' then
		raise exception 'place_details photos: % / %', v_paths, v_count;
	end if;

	-- No user, contribution or date in the public view.
	select string_agg(column_name::text, ',' order by column_name) into v_text
	from information_schema.columns where table_schema = 'public' and table_name = 'place_photos';
	if v_text <> 'credit,height,path,place_id,sort_order,width' then
		raise exception 'place_photos columns: %', v_text;
	end if;

	-- Hidden: gone from every public view; shown again: back.
	if public.moderate_photo(v_photo, 'hide') <> 'hidden' then raise exception 'moderate_photo hide'; end if;
	select count(*) into v_count from public.place_photos where path = v_photo::text || '.webp';
	if v_count <> 0 then raise exception 'hidden photo in place_photos'; end if;
	select cover_path into v_text from public.place_list_items where slug = 'place-1' and city_id = v_city;
	if v_text = v_photo::text || '.webp' then raise exception 'hidden photo as cover'; end if;
	select photo_paths, photo_count into v_paths, v_count from public.place_details where id = v_a;
	if v_photo::text || '.webp' = any (v_paths) or v_count <> 3 then
		raise exception 'hidden photo in place_details: % / %', v_paths, v_count;
	end if;
	if public.moderate_photo(v_photo, 'show') <> 'visible' then raise exception 'moderate_photo show'; end if;
	select count(*) into v_count from public.place_photos where path = v_photo::text || '.webp';
	if v_count <> 1 then raise exception 'photo shown again missing'; end if;

	-- ---------------------------------------------------------------------------
	-- A superseded contribution keeps its photos
	-- ---------------------------------------------------------------------------

	v_result := pg_temp.submit(u1, v_a);
	select count(*) into v_count from public.contributions where id = v_contribution and superseded_at is not null;
	if v_count <> 1 then raise exception 'first contribution not superseded'; end if;
	select count(*) into v_count from public.place_photos where place_id = v_a and credit = 'Ana';
	if v_count <> 3 then raise exception 'photos after supersede: % of 3', v_count; end if;
	select count(*) into v_count from public.photos where id = any (v_photos) and contribution_id = v_contribution;
	if v_count <> 3 then raise exception 'photos lost their contribution: % of 3', v_count; end if;
	-- Still full: the superseded contribution keeps its 3, a retry on it is refused.
	v_text := pg_temp.reserve_error(u1, v_contribution);
	if v_text <> 'photo_limit_contribution' then raise exception 'superseded contribution, 4th photo: got %', v_text; end if;
	if (v_result ->> 'photo_slots')::integer <> 3 then
		raise exception 'photo_slots after 3 photos: got %', v_result ->> 'photo_slots';
	end if;

	-- ---------------------------------------------------------------------------
	-- 15 photos in 24 hours per user
	-- ---------------------------------------------------------------------------

	-- u1 has 3; 4 more contributions × 3 = 15.
	for i in 2..5 loop
		v_c2 := (pg_temp.submit(u1, v_places[i]) ->> 'id')::uuid;
		for j in 1..3 loop
			perform pg_temp.reserve(u1, v_c2);
		end loop;
	end loop;
	v_result := pg_temp.submit(u1, v_places[6]);
	if (v_result ->> 'photo_slots')::integer <> 0 then
		raise exception 'photo_slots at the daily limit: got %', v_result ->> 'photo_slots';
	end if;
	v_text := pg_temp.reserve_error(u1, (v_result ->> 'id')::uuid);
	if v_text <> 'photo_daily_limit' then raise exception '16th photo: got %', v_text; end if;

	-- ---------------------------------------------------------------------------
	-- Deletion: own photos only, files queued
	-- ---------------------------------------------------------------------------

	perform pg_temp.as_user(u2);
	if public.delete_my_photo(v_photos[1]) then raise exception 'deleted someone else''s photo'; end if;
	if pg_temp.queued(v_photos[1]) <> 0 then raise exception 'files queued for a refused deletion'; end if;
	perform pg_temp.as_user(u1);
	if not public.delete_my_photo(v_photos[1]) then raise exception 'delete_my_photo: own photo'; end if;
	select count(*) into v_count from public.photos where id = v_photos[1];
	if v_count <> 0 then raise exception 'deleted photo still there'; end if;
	if pg_temp.queued(v_photos[1]) <> 2 then raise exception 'deleted photo: files not queued'; end if;
	perform pg_temp.as_user(null);
	begin
		perform public.delete_my_photo(v_photos[2]);
		raise exception 'delete_my_photo without a user';
	exception when others then
		if sqlerrm <> 'not_signed_in' then raise; end if;
	end;

	-- Moderation removes for good.
	if public.moderate_photo(v_photo, 'remove') <> 'removed' then raise exception 'moderate_photo remove'; end if;
	if pg_temp.queued(v_photo) <> 2 then raise exception 'removed photo: files not queued'; end if;

	-- Bookings never published: dropped after 24 hours.
	v_c2 := (pg_temp.submit(u2, v_places[2]) ->> 'id')::uuid;
	v_photo := pg_temp.reserve(u2, v_c2);
	update public.photos set created_at = now() - interval '25 hours' where id = v_photo;
	perform pg_temp.as_user(u2);
	if public.can_upload_photo('place-photos', v_photo::text || '.webp') then
		raise exception 'can_upload_photo: expired booking accepted';
	end if;
	if public.cleanup_pending_photos() < 1 then raise exception 'cleanup_pending_photos removed nothing'; end if;
	if pg_temp.queued(v_photo) <> 2 then raise exception 'expired booking: files not queued'; end if;
	select count(*) into v_count from public.photos where id = v_photos[2] and published_at is not null;
	if v_count <> 1 then raise exception 'cleanup_pending_photos removed a published photo'; end if;

	-- Account deletion: every photo of the user goes, its files queued.
	select array_agg(id) into v_photos from public.photos where user_id = u1;
	delete from auth.users where id = u1;
	select count(*) into v_count from public.photos where user_id = u1;
	if v_count <> 0 then raise exception 'photos after account deletion: %', v_count; end if;
	for i in 1..cardinality(v_photos) loop
		if pg_temp.queued(v_photos[i]) <> 2 then raise exception 'account deletion: files not queued'; end if;
	end loop;

	-- The queue: claimed once, finished.
	select count(*) into v_count from public.claim_storage_deletions(1000);
	if v_count < 2 * cardinality(v_photos) then raise exception 'claim_storage_deletions: % rows', v_count; end if;
	select count(*) into v_count from public.claim_storage_deletions(1000);
	if v_count <> 0 then raise exception 'claimed twice: % rows', v_count; end if;
	select public.finish_storage_deletions(array_agg(id)) into v_count
	from public.storage_deletions where name = any (select p::text || '.webp' from unnest(v_photos) p);
	if v_count <> 2 * cardinality(v_photos) then raise exception 'finish_storage_deletions: %', v_count; end if;

	-- ---------------------------------------------------------------------------
	-- RLS and grants: no direct access for the app
	-- ---------------------------------------------------------------------------

	perform pg_temp.as_user(u2);
	set local role authenticated;
	begin
		perform 1 from public.photos limit 1;
		raise exception 'authenticated reads photos';
	exception when insufficient_privilege then null;
	end;
	begin
		perform 1 from public.visible_photos limit 1;
		raise exception 'authenticated reads visible_photos';
	exception when insufficient_privilege then null;
	end;
	begin
		perform 1 from public.storage_deletions limit 1;
		raise exception 'authenticated reads storage_deletions';
	exception when insufficient_privilege then null;
	end;
	begin
		update public.photos set status = 'visible';
		raise exception 'authenticated updates photos';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.moderate_photo(v_photos[2], 'hide');
		raise exception 'authenticated moderates';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.claim_storage_deletions(10);
		raise exception 'authenticated claims deletions';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.configure_storage_cleanup('https://x.supabase.co/functions/v1/storage-cleanup', repeat('a', 40));
		raise exception 'authenticated configures the cleanup';
	exception when insufficient_privilege then null;
	end;
	reset role;

	set local role anon;
	begin
		perform public.reserve_photo(gen_random_uuid(), 1200, 900, '2026-10-29');
		raise exception 'anon calls reserve_photo';
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.can_upload_photo('place-photos', 'x.webp');
		raise exception 'anon calls can_upload_photo';
	exception when insufficient_privilege then null;
	end;
	perform 1 from public.place_photos limit 1;
	reset role;
end;
$$;

select 'photos: ok' as result;

rollback;
