-- DEVELOPMENT PROJECT ONLY. Undoes fixture-grants.sql.
revoke select, insert, delete on public.contributions from service_role;
revoke insert, delete on public.cities from service_role;
revoke delete on public.places from service_role;
revoke select, insert, delete on public.certification_settings from service_role;
revoke select on public.founding_contributors from service_role;
