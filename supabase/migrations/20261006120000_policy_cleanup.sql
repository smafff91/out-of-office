-- Cleanup:
-- - cities and certification_settings had two permissive SELECT policies for authenticated
--   (the public read and the admin "for all"). Split the admin policy into insert/update/delete
--   so each role has exactly one read policy.
-- - rls_auto_enable is an event trigger function created by Supabase: nobody should call it
--   through the API.

-- cities
drop policy "Admins manage cities" on public.cities;
create policy "Admins add cities" on public.cities
	for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update cities" on public.cities
	for update to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete cities" on public.cities
	for delete to authenticated using ((select public.is_admin()));

-- certification settings
drop policy "Admins manage certification settings" on public.certification_settings;
create policy "Admins add certification settings" on public.certification_settings
	for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update certification settings" on public.certification_settings
	for update to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete certification settings" on public.certification_settings
	for delete to authenticated using ((select public.is_admin()));

-- rls_auto_enable: event triggers still fire it; only the API roles lose EXECUTE.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
