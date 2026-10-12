-- DEVELOPMENT PROJECT ONLY. Not a migration: never applied to production.
-- Lets the secret key (scripts/dev-fixtures.ts) add and remove anonymous test contributions.
-- Apply with `npm run dev:grants`, undo with `npm run dev:grants -- --revoke`.
grant select, insert, delete on public.contributions to service_role;
