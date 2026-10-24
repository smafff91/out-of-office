-- Sign-in and public name (feature 7a):
-- - profiles: first name only (≤30), show_name (null until the user chooses), preferred locale.
--   Profiles are private: each user reads and edits only their own row. Names reach the public
--   only through views, and only when show_name is true.
-- - The locale is copied into auth.users.raw_user_meta_data, which the sign-in email template
--   reads ({{ .Data.locale }}).
-- - place_notes: no author, month only. place_contributors: public names per place, no dates.
--   A name is never linked to a date or to an identifier shared across places.
--
-- Account deletion (GDPR) needs nothing new: deleting from auth.users cascades to profiles
-- (display_name, show_name, locale go with the row), the user metadata lives in auth.users
-- itself, and anonymize_contributions() still drops notes before the profile goes.

-- ---------------------------------------------------------------------------
-- profiles: new columns and stricter name
-- ---------------------------------------------------------------------------

update public.profiles
set display_name = nullif(btrim(left(btrim(display_name), 30)), '')
where display_name is not null;

update public.profiles set display_name = null where position('@' in display_name) > 0;

alter table public.profiles drop constraint profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check check (
	char_length(display_name) between 1 and 30
	and display_name = btrim(display_name)
	and position('@' in display_name) = 0
);

alter table public.profiles
	add column show_name boolean,
	add column locale text check (locale in ('en', 'es', 'ca'));

-- First name from Google (given_name); nothing for email sign-ins. Locale from the sign-up
-- metadata (signInWithOtp sends the interface language).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_name text := btrim(left(split_part(btrim(coalesce(
		new.raw_user_meta_data ->> 'given_name',
		new.raw_user_meta_data ->> 'full_name',
		new.raw_user_meta_data ->> 'name',
		''
	)), ' ', 1), 30));
	v_locale text := new.raw_user_meta_data ->> 'locale';
begin
	insert into public.profiles (id, display_name, locale)
	values (
		new.id,
		case when v_name <> '' and position('@' in v_name) = 0 then v_name end,
		case when v_locale in ('en', 'es', 'ca') then v_locale end
	);
	return new;
end;
$$;

-- The email template reads the user metadata, the app writes the profile: keep them in step.
create function public.sync_profile_locale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update auth.users u
	set raw_user_meta_data = case
		when new.locale is null then coalesce(u.raw_user_meta_data, '{}'::jsonb) - 'locale'
		else coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('locale', new.locale)
	end
	where u.id = new.id;
	return new;
end;
$$;

create trigger profiles_sync_locale
	after update of locale on public.profiles
	for each row
	when (new.locale is distinct from old.locale)
	execute function public.sync_profile_locale();

-- ---------------------------------------------------------------------------
-- RLS and grants: profiles are private
-- ---------------------------------------------------------------------------

drop policy "Profiles are public" on public.profiles;
create policy "Users read their own profile" on public.profiles
	for select to authenticated
	using (id = (select auth.uid()) or (select public.is_admin()));

revoke select, update on public.profiles from anon, authenticated;
grant select (id, display_name, show_name, locale, founding_contributor, created_at)
	on public.profiles to authenticated;
-- Only these three: role and founding status are never writable through the API
-- (protect_profile() stays as a second barrier).
grant update (display_name, show_name, locale) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Public views
-- ---------------------------------------------------------------------------

-- Notes without their author, dated by month only: the exact day never leaves the database.
drop view public.place_notes;
create view public.place_notes as
select
	c.place_id,
	c.note,
	to_char(c.created_at at time zone ci.timezone, 'YYYY-MM') as created_month
from public.contributions c
join public.places p on p.id = c.place_id and p.review_status = 'approved'
join public.cities ci on ci.id = p.city_id
where c.note is not null and c.note <> '';

-- Names of the people who chose to show them, per place ("Shared by Ana and Luca").
-- No profile id, dates or counts: the same person cannot be followed from place to place.
create view public.place_contributors as
select distinct
	c.place_id,
	pr.display_name
from public.contributions c
join public.profiles pr on pr.id = c.user_id
join public.places p on p.id = c.place_id and p.review_status = 'approved'
where pr.show_name is true and pr.display_name is not null
order by c.place_id, pr.display_name;

grant select on public.place_notes, public.place_contributors to anon, authenticated;

-- Functions: Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function public.sync_profile_locale() from public, anon, authenticated;
