-- At most 3 visible photos per user and place (correction to feature 7c): with several updates
-- in a row a single user could otherwise fill a place's gallery (12) alone.
-- - photos_per_user_place in certification_settings, like the other limits.
-- - publish_photo(): once a photo is published, the user's oldest visible photos of that place
--   beyond the limit are deleted (their files go to storage_deletions through the existing
--   trigger). Only at publication: a booking or a failed upload never removes anything.
--   Hidden photos (moderation) neither count nor are ever deleted by this rule.
-- - my_place_photo_count(): the user's own visible photos of a place, for the form's notice.
-- The limits of 3 per contribution and 15 per 24 hours are unchanged.

alter table public.certification_settings
	add column photos_per_user_place integer not null default 3 check (photos_per_user_place >= 1);

-- Same as 20261029130000_photo_storage.sql, plus the per-place limit after publishing.
create or replace function public.publish_photo(p_photo_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_photo public.photos;
	v_limit integer;
begin
	if auth.uid() is null then
		raise exception 'not_signed_in' using errcode = '42501';
	end if;

	-- Same lock as reserve_photo(): two publications at once cannot exceed the limit.
	perform pg_advisory_xact_lock(hashtextextended('photo:' || auth.uid()::text, 0));

	select * into v_photo
	from public.photos ph
	where ph.id = p_photo_id and ph.user_id = auth.uid()
	for update;
	if not found then
		raise exception 'photo_not_found' using errcode = 'P0001';
	end if;
	if v_photo.published_at is not null then
		return true;
	end if;

	if (
		select count(*)
		from storage.objects o
		join storage.buckets b on b.id = o.bucket_id
		where o.bucket_id in ('place-photos', 'place-photo-thumbs')
			and o.name = v_photo.storage_path
			and o.metadata ->> 'mimetype' = 'image/webp'
			and (o.metadata ->> 'size')::bigint <= b.file_size_limit
	) < 2 then
		raise exception 'photo_files_missing' using errcode = 'P0001';
	end if;

	-- clock_timestamp(): distinct even for several publications in one transaction.
	update public.photos set published_at = clock_timestamp() where id = v_photo.id;

	-- The newest photos stay: the user's visible ones of this place beyond the limit go.
	select (public.city_settings(p.city_id)).photos_per_user_place into v_limit
	from public.places p
	where p.id = v_photo.place_id;

	delete from public.photos ph
	where ph.id in (
		select o.id
		from public.photos o
		where o.user_id = v_photo.user_id
			and o.place_id = v_photo.place_id
			and o.status = 'visible'
			and o.published_at is not null
		order by o.published_at desc, o.id desc
		offset v_limit
	);

	return true;
end;
$$;

-- How many visible photos the signed-in user has in a place (nothing about other users).
create function public.my_place_photo_count(p_place_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'not_signed_in' using errcode = '42501';
	end if;
	return (
		select count(*)::integer
		from public.photos ph
		where ph.user_id = auth.uid()
			and ph.place_id = p_place_id
			and ph.status = 'visible'
			and ph.published_at is not null
	);
end;
$$;

revoke execute on function public.my_place_photo_count(uuid) from public, anon, authenticated;
grant execute on function public.my_place_photo_count(uuid) to authenticated;
