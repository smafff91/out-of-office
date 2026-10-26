-- User photos (feature 7c), storage side. Schema and booking: 20261029120000_photos.sql.
-- - Two public buckets, WebP only, each with its own size cap: place-photos (the 1200 px
--   version, 1 MiB) and place-photo-thumbs (400 px, 150 KiB). The same random name in both
--   (<photo id>.webp): no user id in any public URL.
-- - The app may only insert, and only a name it booked with reserve_photo() in the last 24 hours
--   and not yet published: no overwrite, no listing, no deletion.
-- - publish_photo(): the photo goes public once both files are there, WebP and within the caps.
-- - Files are never deleted with SQL (storage.protect_delete forbids it and the file would stay):
--   every deleted photo row (by the user, by moderation, with the account, an expired booking)
--   queues its two files in storage_deletions; the storage-cleanup Edge Function removes them
--   through the Storage API. pg_cron calls it every 10 minutes, only when the queue is not
--   empty, with a shared secret kept in Vault (configure_storage_cleanup(), run by
--   `npm run photos -- --setup-cleanup` once per project: the function URL depends on it).
-- - pg_cron also drops, every hour, the bookings never published after 24 hours.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
	('place-photos', 'place-photos', true, 1048576, '{image/webp}'),
	('place-photo-thumbs', 'place-photo-thumbs', true, 153600, '{image/webp}')
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Upload rules
-- ---------------------------------------------------------------------------

-- True when the signed-in user booked this name, less than 24 hours ago, and it is not
-- published yet. Read by the upload policy (which runs as the user).
create function public.can_upload_photo(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_bucket in ('place-photos', 'place-photo-thumbs') and exists (
		select 1
		from public.photos ph
		where ph.storage_path = p_name
			and ph.user_id = auth.uid()
			and ph.published_at is null
			and ph.created_at > now() - interval '24 hours'
	);
$$;

-- Insert only: without select and update policies an existing file cannot be overwritten
-- (upsert) or listed.
create policy "Users upload the photos they booked" on storage.objects
	for insert to authenticated
	with check (
		bucket_id in ('place-photos', 'place-photo-thumbs')
		and public.can_upload_photo(bucket_id, name)
	);

-- Makes a booked photo public once both files are in their buckets, WebP and within each
-- bucket's cap. Idempotent: true when the photo is published (now or before).
-- Errors: not_signed_in, photo_not_found, photo_files_missing.
create function public.publish_photo(p_photo_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_photo public.photos;
begin
	if auth.uid() is null then
		raise exception 'not_signed_in' using errcode = '42501';
	end if;

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

	update public.photos set published_at = now() where id = v_photo.id;
	return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- File deletion queue
-- ---------------------------------------------------------------------------

create table public.storage_deletions (
	id bigint generated always as identity primary key,
	bucket_id text not null,
	name text not null,
	queued_at timestamptz not null default now(),
	-- Taken by a cleanup run; taken again if that run did not finish within 5 minutes.
	claimed_at timestamptz,
	attempts integer not null default 0
);

alter table public.storage_deletions enable row level security;

-- Every deleted photo row, whatever deleted it (cascades from the account included).
create function public.queue_photo_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.storage_deletions (bucket_id, name)
	values ('place-photos', old.storage_path), ('place-photo-thumbs', old.storage_path);
	return old;
end;
$$;

create trigger photos_queue_files
	after delete on public.photos
	for each row execute function public.queue_photo_files();

-- The next files to delete (storage-cleanup, `npm run photos -- --remove`). service_role only.
create function public.claim_storage_deletions(p_limit integer default 100)
returns table (id bigint, bucket_id text, name text)
language sql
volatile
security definer
set search_path = ''
as $$
	update public.storage_deletions d
	set claimed_at = now(), attempts = d.attempts + 1
	where d.id in (
		select q.id
		from public.storage_deletions q
		where q.claimed_at is null or q.claimed_at < now() - interval '5 minutes'
		order by q.id
		limit least(greatest(p_limit, 1), 1000)
		for update skip locked
	)
	returning d.id, d.bucket_id, d.name;
$$;

-- The files the Storage API removed (or that were already gone). service_role only.
create function public.finish_storage_deletions(p_ids bigint[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_count integer;
begin
	delete from public.storage_deletions d where d.id = any (p_ids);
	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------

-- Bookings never published after 24 hours: deleted, their files (if any arrived) queued.
create function public.cleanup_pending_photos()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_count integer;
begin
	delete from public.photos ph
	where ph.published_at is null and ph.created_at < now() - interval '24 hours';
	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

select cron.schedule('photos-cleanup-pending', '17 * * * *', 'select public.cleanup_pending_photos()');

-- Stores the shared secret in Vault and (re)schedules the call to the storage-cleanup function.
-- The job text holds the URL and the name of the secret, never its value: it is read from Vault
-- at each run. Run by `npm run photos -- --setup-cleanup`, which generates the secret and sets it
-- on the function too. service_role only.
create function public.configure_storage_cleanup(p_url text, p_secret text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_secret_id uuid;
begin
	if p_url is null or p_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/storage-cleanup$' then
		raise exception 'invalid_url' using errcode = '22023';
	end if;
	if p_secret is null or char_length(p_secret) < 32 then
		raise exception 'invalid_secret' using errcode = '22023';
	end if;

	select s.id into v_secret_id from vault.secrets s where s.name = 'storage_cleanup_secret';
	if found then
		perform vault.update_secret(v_secret_id, p_secret);
	else
		perform vault.create_secret(
			p_secret,
			'storage_cleanup_secret',
			'Sent by pg_cron to the storage-cleanup Edge Function (x-cleanup-secret)'
		);
	end if;

	perform cron.schedule('photos-delete-files', '*/10 * * * *', format(
		$job$
		select net.http_post(
			url := %L,
			headers := jsonb_build_object(
				'content-type', 'application/json',
				'x-cleanup-secret', (
					select s.decrypted_secret from vault.decrypted_secrets s
					where s.name = 'storage_cleanup_secret'
				)
			),
			body := '{}'::jsonb,
			timeout_milliseconds := 30000
		)
		where exists (select 1 from public.storage_deletions)
		$job$,
		p_url
	));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

revoke execute on function
	public.can_upload_photo(text, text),
	public.publish_photo(uuid),
	public.queue_photo_files(),
	public.claim_storage_deletions(integer),
	public.finish_storage_deletions(bigint[]),
	public.cleanup_pending_photos(),
	public.configure_storage_cleanup(text, text)
	from public, anon, authenticated;
-- The upload policy runs as the user and calls can_upload_photo().
grant execute on function public.can_upload_photo(text, text), public.publish_photo(uuid)
	to authenticated;
grant execute on function
	public.claim_storage_deletions(integer),
	public.finish_storage_deletions(bigint[]),
	public.configure_storage_cleanup(text, text)
	to service_role;
