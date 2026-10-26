-- The prefilled public name comes only from Google's first name (first word of given_name): no
-- fallback to full_name or name, and nothing for email sign-ins. Never from the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_name text := btrim(left(split_part(btrim(coalesce(
		new.raw_user_meta_data ->> 'given_name',
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
