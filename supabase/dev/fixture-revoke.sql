-- DEVELOPMENT PROJECT ONLY. Undoes fixture-grants.sql.
revoke select, insert, delete on public.contributions from service_role;
