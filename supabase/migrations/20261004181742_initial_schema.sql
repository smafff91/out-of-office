-- Initial schema: cities, places, contributions, photos, reports, city votes, profiles,
-- certification settings, public aggregate views, RLS and explicit grants.
--
-- Conventions:
-- - Automatic API exposure is off in this project: every grant to anon/authenticated is explicit.
-- - RLS is enabled explicitly on every table.
-- - Fields that only the database may set (check-in, level, certification, roles) are protected
--   by triggers for API callers; future SECURITY DEFINER functions run as the owner and may set them.

create extension if not exists postgis with schema extensions;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.wifi_level as enum ('none', 'slow', 'fast');
create type public.outlets_level as enum ('none', 'a_few', 'plenty');
create type public.noise_level as enum ('quiet', 'noisy');
create type public.long_stays as enum ('welcome', 'not_really');
create type public.laptop_rule as enum ('no_laptops_lunch', 'no_laptops_weekends', 'time_limit', 'none');
create type public.place_extra as enum ('air_conditioning', 'toilet', 'large_tables', 'minimum_spend');
create type public.place_level as enum ('osm_only', 'community', 'certified');
create type public.cert_origin as enum ('manual', 'community');
create type public.osm_type as enum ('node', 'way', 'relation');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.photo_status as enum ('visible', 'hidden');
create type public.report_reason as enum (
	'closed_permanently',
	'wrong_hours',
	'wrong_location',
	'laptops_not_allowed',
	'inappropriate_content',
	'other'
);
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.user_role as enum ('user', 'admin');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the statement comes straight from the API (not from a SECURITY DEFINER function).
create function public.is_api_caller()
returns boolean
language sql
stable
set search_path = ''
as $$
	select current_user in ('anon', 'authenticated');
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	display_name text check (char_length(display_name) between 1 and 50),
	role public.user_role not null default 'user',
	founding_contributor boolean not null default false,
	created_at timestamptz not null default now()
);

-- Defined after profiles because it reads it.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.profiles where id = auth.uid() and role = 'admin'
	);
$$;

create table public.cities (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	name text not null,
	country_code char(2) not null,
	timezone text not null,
	center extensions.geometry(Point, 4326) not null,
	bbox extensions.geometry(Polygon, 4326) not null,
	osm_relation_id bigint,
	is_active boolean not null default false,
	created_at timestamptz not null default now()
);

create table public.places (
	id uuid primary key default gen_random_uuid(),
	city_id uuid not null references public.cities (id),
	osm_type public.osm_type,
	osm_id bigint,
	slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	name text not null,
	geom extensions.geometry(Point, 4326) not null,
	lat double precision generated always as (extensions.st_y(geom)) stored,
	lng double precision generated always as (extensions.st_x(geom)) stored,
	address text,
	neighborhood text,
	opening_hours text,
	phone text,
	website text,
	instagram text,
	internet_access_osm text,
	osm_missing_since timestamptz,
	level public.place_level not null default 'osm_only',
	cert_origin public.cert_origin,
	certified_at timestamptz,
	revoked_at timestamptz,
	added_by uuid references public.profiles (id) on delete set null,
	review_status public.review_status not null default 'approved',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (city_id, slug),
	unique (osm_type, osm_id),
	check ((osm_type is null) = (osm_id is null)),
	-- After a revocation, cert_origin and certified_at stay as history next to revoked_at.
	check (level <> 'certified' or (cert_origin is not null and certified_at is not null))
);

create index places_geom_idx on public.places using gist (geom);
create index places_city_idx on public.places (city_id);
create index places_review_idx on public.places (review_status) where review_status <> 'approved';

create trigger places_set_updated_at
	before update on public.places
	for each row execute function public.set_updated_at();

create table public.contributions (
	id uuid primary key default gen_random_uuid(),
	place_id uuid not null references public.places (id) on delete cascade,
	user_id uuid default auth.uid() references public.profiles (id) on delete set null,
	-- Set when the author deletes their account: one random key per (author, place), so per-place
	-- distinct-user counts stay exact without linking the person or their places.
	anon_key uuid,
	would_work_again boolean not null,
	wifi public.wifi_level not null,
	outlets public.outlets_level not null,
	noise public.noise_level not null,
	long_stays public.long_stays not null,
	laptop_rules public.laptop_rule[], -- null = not answered
	extras public.place_extra[] not null default '{}',
	note text check (char_length(note) <= 140),
	checked_in boolean not null default false,
	checkin_distance_m integer check (checkin_distance_m >= 0),
	created_at timestamptz not null default now(),
	check (user_id is not null or anon_key is not null),
	check (laptop_rules is null or not ('none' = any (laptop_rules) and cardinality(laptop_rules) > 1))
);

create index contributions_place_idx on public.contributions (place_id, created_at desc);
create index contributions_user_idx on public.contributions (user_id);

create table public.photos (
	id uuid primary key default gen_random_uuid(),
	place_id uuid not null references public.places (id) on delete cascade,
	user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
	contribution_id uuid references public.contributions (id) on delete set null,
	storage_path text not null unique,
	width integer check (width > 0),
	height integer check (height > 0),
	status public.photo_status not null default 'visible',
	created_at timestamptz not null default now()
);

create index photos_place_idx on public.photos (place_id);

create table public.reports (
	id uuid primary key default gen_random_uuid(),
	place_id uuid not null references public.places (id) on delete cascade,
	reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
	reason public.report_reason not null,
	photo_id uuid references public.photos (id) on delete set null,
	contribution_id uuid references public.contributions (id) on delete set null,
	note text check (char_length(note) <= 500),
	status public.report_status not null default 'open',
	created_at timestamptz not null default now(),
	resolved_at timestamptz
);

create index reports_place_idx on public.reports (place_id);
create index reports_open_idx on public.reports (created_at) where status = 'open';

create table public.city_votes (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
	city_name text not null check (char_length(city_name) between 1 and 100),
	country_code char(2),
	created_at timestamptz not null default now()
);

create unique index city_votes_one_per_user_idx
	on public.city_votes (user_id, lower(city_name), coalesce(country_code, ''));

-- All certification thresholds in one place. The row with city_id null is the default;
-- a row for a specific city overrides it entirely.
create table public.certification_settings (
	id uuid primary key default gen_random_uuid(),
	city_id uuid unique nulls not distinct references public.cities (id) on delete cascade,
	min_users integer not null,
	min_checkin_ratio numeric(3, 2) not null check (min_checkin_ratio between 0 and 1),
	min_span_days integer not null,
	min_score numeric(3, 2) not null check (min_score between 0 and 1),
	revoke_below_score numeric(3, 2) not null check (revoke_below_score between 0 and 1),
	revoke_min_votes integer not null,
	revoke_window_months integer not null,
	review_reports_count integer not null,
	review_reports_window_days integer not null,
	manual_recheck_months integer not null,
	vote_cooldown_days integer not null,
	checkin_radius_m integer not null,
	score_min_votes integer not null,
	updated_at timestamptz not null default now()
);

create trigger certification_settings_set_updated_at
	before update on public.certification_settings
	for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles: created on sign-up, anonymizing on deletion
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id, display_name)
	values (
		new.id,
		nullif(
			left(split_part(coalesce(
				new.raw_user_meta_data ->> 'given_name',
				new.raw_user_meta_data ->> 'full_name',
				new.raw_user_meta_data ->> 'name',
				''
			), ' ', 1), 50),
			''
		)
	);
	return new;
end;
$$;

create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

-- Before a profile is deleted (account deletion cascades from auth.users): keep votes and
-- attributes anonymously, drop notes. Photos and city votes are deleted by their foreign keys.
create function public.anonymize_contributions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.contributions c
	set anon_key = k.anon_key, note = null
	from (
		select place_id, gen_random_uuid() as anon_key
		from public.contributions
		where user_id = old.id
		group by place_id
	) k
	where c.user_id = old.id and c.place_id = k.place_id;
	return old;
end;
$$;

create trigger profiles_anonymize_contributions
	before delete on public.profiles
	for each row execute function public.anonymize_contributions();

-- Users may change their own display name, never their role or founding status.
create function public.protect_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if public.is_api_caller() and not public.is_admin() then
		new.id := old.id;
		new.role := old.role;
		new.founding_contributor := old.founding_contributor;
		new.created_at := old.created_at;
	end if;
	return new;
end;
$$;

create trigger profiles_protect
	before update on public.profiles
	for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------------
-- Protection triggers for rows inserted through the API
-- ---------------------------------------------------------------------------

create function public.protect_contribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if public.is_api_caller() then
		new.user_id := auth.uid();
		new.anon_key := null;
		-- Check-in is verified in SQL with PostGIS by a dedicated function (feature 7).
		new.checked_in := false;
		new.checkin_distance_m := null;
		new.created_at := now();
	end if;
	return new;
end;
$$;

-- One vote per user per place per cooldown period: the newest replaces the previous one.
create function public.replace_recent_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	cooldown integer;
begin
	if new.user_id is null then
		return new;
	end if;

	select coalesce(
		(select s.vote_cooldown_days
			from public.certification_settings s
			join public.places p on p.city_id = s.city_id
			where p.id = new.place_id),
		(select s.vote_cooldown_days from public.certification_settings s where s.city_id is null),
		30
	) into cooldown;

	delete from public.contributions
	where user_id = new.user_id
		and place_id = new.place_id
		and created_at > now() - make_interval(days => cooldown);

	return new;
end;
$$;

-- Triggers fire in name order: protect first, then replace.
create trigger contributions_a_protect
	before insert on public.contributions
	for each row execute function public.protect_contribution();

create trigger contributions_b_replace_recent
	before insert on public.contributions
	for each row execute function public.replace_recent_contribution();

-- Users can suggest a missing place; it waits for admin review.
create function public.protect_place_insert()
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
	end if;
	return new;
end;
$$;

create trigger places_protect_insert
	before insert on public.places
	for each row execute function public.protect_place_insert();

create function public.protect_photo_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if public.is_api_caller() and not public.is_admin() then
		new.user_id := auth.uid();
		new.status := 'visible';
	end if;
	return new;
end;
$$;

create trigger photos_protect_insert
	before insert on public.photos
	for each row execute function public.protect_photo_insert();

create function public.protect_report_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if public.is_api_caller() then
		new.reporter_id := auth.uid();
		new.status := 'open';
		new.resolved_at := null;
		new.created_at := now();
	end if;
	return new;
end;
$$;

create trigger reports_protect_insert
	before insert on public.reports
	for each row execute function public.protect_report_insert();

-- ---------------------------------------------------------------------------
-- Public aggregate views (the raw contributions table is private)
-- Views run with the owner's rights, so they read contributions past RLS and expose only
-- aggregates: never user_id, distance, exact time or per-contribution check-in.
-- Dates are days in the city's timezone.
-- ---------------------------------------------------------------------------

create view public.place_scores as
select
	c.place_id,
	count(*)::integer as votes,
	(count(*) filter (where c.would_work_again))::integer as yes_votes,
	round(100.0 * count(*) filter (where c.would_work_again) / count(*))::integer as score_pct
from public.contributions c
join public.places p on p.id = c.place_id and p.review_status = 'approved'
group by c.place_id;

create view public.place_attributes as
with answers as (
	select place_id, created_at, 'wifi' as attribute, wifi::text as value from public.contributions
	union all
	select place_id, created_at, 'outlets', outlets::text from public.contributions
	union all
	select place_id, created_at, 'noise', noise::text from public.contributions
	union all
	select place_id, created_at, 'long_stays', long_stays::text from public.contributions
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

create view public.place_laptop_rules as
select
	r.place_id,
	r.rule,
	count(*)::integer as confirmations,
	(max(r.created_at) at time zone ci.timezone)::date as last_confirmed_on
from (
	select place_id, created_at, unnest(laptop_rules) as rule
	from public.contributions
	where laptop_rules is not null
) r
join public.places p on p.id = r.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
group by r.place_id, r.rule, ci.timezone;

create view public.place_notes as
select
	c.place_id,
	c.note,
	pr.display_name as author_name,
	(c.created_at at time zone ci.timezone)::date as created_on
from public.contributions c
join public.profiles pr on pr.id = c.user_id
join public.places p on p.id = c.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
where c.note is not null and c.note <> '';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.places enable row level security;
alter table public.contributions enable row level security;
alter table public.photos enable row level security;
alter table public.reports enable row level security;
alter table public.city_votes enable row level security;
alter table public.certification_settings enable row level security;

-- profiles: public names; users edit their own name; admins everything.
create policy "Profiles are public" on public.profiles
	for select to anon, authenticated using (true);
create policy "Users update their own profile" on public.profiles
	for update to authenticated
	using (id = (select auth.uid()) or (select public.is_admin()))
	with check (id = (select auth.uid()) or (select public.is_admin()));

-- cities
create policy "Cities are public" on public.cities
	for select to anon, authenticated using (true);
create policy "Admins manage cities" on public.cities
	for all to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));

-- places
create policy "Approved places are public" on public.places
	for select to anon using (review_status = 'approved');
create policy "Users see approved places and their own suggestions" on public.places
	for select to authenticated
	using (review_status = 'approved' or added_by = (select auth.uid()) or (select public.is_admin()));
create policy "Users suggest places" on public.places
	for insert to authenticated
	with check (added_by = (select auth.uid()) or (select public.is_admin()));
create policy "Admins update places" on public.places
	for update to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete places" on public.places
	for delete to authenticated using ((select public.is_admin()));

-- contributions: only the author (and admins) read raw rows.
create policy "Users read their own contributions" on public.contributions
	for select to authenticated
	using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Users add their own contributions" on public.contributions
	for insert to authenticated
	with check (user_id = (select auth.uid()));
create policy "Admins update contributions" on public.contributions
	for update to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Users delete their own contributions" on public.contributions
	for delete to authenticated
	using (user_id = (select auth.uid()) or (select public.is_admin()));

-- photos
create policy "Visible photos are public" on public.photos
	for select to anon using (status = 'visible');
create policy "Users see visible photos and their own" on public.photos
	for select to authenticated
	using (status = 'visible' or user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Users add their own photos" on public.photos
	for insert to authenticated
	with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins update photos" on public.photos
	for update to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Users delete their own photos" on public.photos
	for delete to authenticated
	using (user_id = (select auth.uid()) or (select public.is_admin()));

-- reports
create policy "Users read their own reports" on public.reports
	for select to authenticated
	using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy "Users send reports" on public.reports
	for insert to authenticated
	with check (reporter_id = (select auth.uid()));
create policy "Admins update reports" on public.reports
	for update to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete reports" on public.reports
	for delete to authenticated using ((select public.is_admin()));

-- city votes
create policy "Users read their own city votes" on public.city_votes
	for select to authenticated
	using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Users vote for cities" on public.city_votes
	for insert to authenticated
	with check (user_id = (select auth.uid()));
create policy "Users remove their own city votes" on public.city_votes
	for delete to authenticated
	using (user_id = (select auth.uid()) or (select public.is_admin()));

-- certification settings
create policy "Certification settings are public" on public.certification_settings
	for select to anon, authenticated using (true);
create policy "Admins manage certification settings" on public.certification_settings
	for all to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Grants (explicit: automatic exposure is off)
-- ---------------------------------------------------------------------------

-- profiles: the role column stays private (admins check it through is_admin()).
grant select (id, display_name, founding_contributor, created_at) on public.profiles to anon, authenticated;
grant update (display_name, founding_contributor, role) on public.profiles to authenticated;

grant select on public.cities to anon, authenticated;
grant insert, update, delete on public.cities to authenticated;

grant select on public.places to anon, authenticated;
grant insert, update, delete on public.places to authenticated;

grant select, insert, update, delete on public.contributions to authenticated;

grant select on public.photos to anon, authenticated;
grant insert, update, delete on public.photos to authenticated;

grant select, insert, update, delete on public.reports to authenticated;

grant select, insert, delete on public.city_votes to authenticated;

grant select on public.certification_settings to anon, authenticated;
grant insert, update, delete on public.certification_settings to authenticated;

grant select on public.place_scores, public.place_attributes, public.place_laptop_rules, public.place_notes
	to anon, authenticated;

-- Functions: Postgres grants EXECUTE to PUBLIC by default; keep only what the API needs.
revoke execute on function
	public.is_api_caller(),
	public.is_admin(),
	public.set_updated_at(),
	public.handle_new_user(),
	public.anonymize_contributions(),
	public.protect_profile(),
	public.protect_contribution(),
	public.replace_recent_contribution(),
	public.protect_place_insert(),
	public.protect_photo_insert(),
	public.protect_report_insert()
	from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_api_caller() to anon, authenticated;
