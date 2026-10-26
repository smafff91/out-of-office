-- DEVELOPMENT PROJECT ONLY. Not a migration: never applied to production.
-- Lets the secret key (scripts/dev-fixtures.ts) add and remove anonymous test contributions,
-- and tests/db/contributions.check.ts create and remove a temporary test city (with its place,
-- settings and Founding seats) to submit contributions in parallel.
-- Apply with `npm run dev:grants`, undo with `npm run dev:grants -- --revoke`.
grant select, insert, delete on public.contributions to service_role;
grant insert, delete on public.cities to service_role;
grant delete on public.places to service_role;
grant select, insert, delete on public.certification_settings to service_role;
grant select on public.founding_contributors to service_role;
