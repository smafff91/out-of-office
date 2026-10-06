-- OSM import support:
-- - cities: real boundary, admin levels used for districts/neighborhoods, import dates.
-- - neighborhoods: districts and neighborhoods from OSM boundaries, with an optional short name
--   (shown instead of the official name when set).
-- - places: neighborhood_id replaces the unused neighborhood text column.
-- - Two import functions and minimal grants for service_role (used only by scripts/import-osm.ts).

-- ---------------------------------------------------------------------------
-- cities
-- ---------------------------------------------------------------------------

alter table public.cities
	add column boundary extensions.geometry(MultiPolygon, 4326),
	add column district_admin_level smallint,
	add column neighborhood_admin_level smallint,
	add column last_osm_import_at timestamptz,
	add column osm_data_at timestamptz;

-- Barcelona: districtes are admin_level 9, barris admin_level 10.
update public.cities
set district_admin_level = 9, neighborhood_admin_level = 10
where slug = 'barcelona';

-- ---------------------------------------------------------------------------
-- neighborhoods
-- ---------------------------------------------------------------------------

create type public.neighborhood_kind as enum ('district', 'neighborhood');

create table public.neighborhoods (
	id uuid primary key default gen_random_uuid(),
	city_id uuid not null references public.cities (id),
	osm_relation_id bigint not null unique,
	kind public.neighborhood_kind not null,
	parent_id uuid references public.neighborhoods (id) on delete set null,
	name text not null,
	-- Optional everyday name (e.g. "El Born"), filled in by hand; the import never touches it.
	short_name text check (short_name is null or char_length(short_name) between 1 and 40),
	geom extensions.geometry(MultiPolygon, 4326) not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index neighborhoods_geom_idx on public.neighborhoods using gist (geom);
create index neighborhoods_city_idx on public.neighborhoods (city_id, kind);

create trigger neighborhoods_set_updated_at
	before update on public.neighborhoods
	for each row execute function public.set_updated_at();

alter table public.neighborhoods enable row level security;

create policy "Neighborhoods are public" on public.neighborhoods
	for select to anon, authenticated using (true);
create policy "Admins add neighborhoods" on public.neighborhoods
	for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update neighborhoods" on public.neighborhoods
	for update to authenticated
	using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete neighborhoods" on public.neighborhoods
	for delete to authenticated using ((select public.is_admin()));

grant select on public.neighborhoods to anon, authenticated;
grant insert, update, delete on public.neighborhoods to authenticated;

-- ---------------------------------------------------------------------------
-- places
-- ---------------------------------------------------------------------------

alter table public.places drop column neighborhood;
alter table public.places
	add column neighborhood_id uuid references public.neighborhoods (id) on delete set null;
create index places_neighborhood_idx on public.places (neighborhood_id);

-- ---------------------------------------------------------------------------
-- Import functions (service_role only)
-- ---------------------------------------------------------------------------

-- Builds polygons from OSM boundary lines and saves the city boundary, districts and
-- neighborhoods. Areas whose inner point falls outside the city are skipped (Overpass also
-- returns those of bordering towns). short_name is never touched.
--   p_city_lines: GeoJSON MultiLineString of the city relation's outer/inner ways
--   p_areas: [{ osm_relation_id, admin_level, name, lines: GeoJSON MultiLineString }]
create function public.import_osm_boundaries(p_city_id uuid, p_city_lines jsonb, p_areas jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
	v_city public.cities;
	v_boundary extensions.geometry;
	v_invalid jsonb := '[]'::jsonb;
	v_outside integer := 0;
	v_districts integer := 0;
	v_neighborhoods integer := 0;
begin
	select * into strict v_city from public.cities where id = p_city_id;

	v_boundary := extensions.st_multi(extensions.st_collectionextract(
		extensions.st_makevalid(extensions.st_buildarea(extensions.st_geomfromgeojson(p_city_lines))), 3));
	if v_boundary is null or extensions.st_isempty(v_boundary) then
		raise exception 'Could not build the boundary of city %', v_city.slug;
	end if;
	update public.cities set boundary = extensions.st_setsrid(v_boundary, 4326) where id = p_city_id;
	v_boundary := extensions.st_setsrid(v_boundary, 4326);

	create temporary table osm_areas on commit drop as
	select
		(a ->> 'osm_relation_id')::bigint as osm_relation_id,
		case (a ->> 'admin_level')::smallint
			when v_city.district_admin_level then 'district'::public.neighborhood_kind
			when v_city.neighborhood_admin_level then 'neighborhood'::public.neighborhood_kind
		end as kind,
		a ->> 'name' as name,
		extensions.st_setsrid(extensions.st_multi(extensions.st_collectionextract(
			extensions.st_makevalid(extensions.st_buildarea(extensions.st_geomfromgeojson(a -> 'lines'))), 3)), 4326)
			as geom
	from jsonb_array_elements(p_areas) a;

	select coalesce(jsonb_agg(jsonb_build_object('osm_relation_id', osm_relation_id, 'name', name)), '[]'::jsonb)
	into v_invalid
	from osm_areas
	where kind is not null and (geom is null or extensions.st_isempty(geom));

	delete from osm_areas
	where kind is null or name is null or geom is null or extensions.st_isempty(geom);

	delete from osm_areas where not extensions.st_contains(v_boundary, extensions.st_pointonsurface(geom));
	get diagnostics v_outside = row_count;

	insert into public.neighborhoods (city_id, osm_relation_id, kind, name, geom)
	select p_city_id, osm_relation_id, kind, name, geom from osm_areas
	on conflict (osm_relation_id) do update
	set city_id = excluded.city_id, kind = excluded.kind, name = excluded.name, geom = excluded.geom
	where (neighborhoods.city_id, neighborhoods.kind, neighborhoods.name) is distinct from
			(excluded.city_id, excluded.kind, excluded.name)
		or not extensions.st_equals(neighborhoods.geom, excluded.geom);

	-- Each neighborhood belongs to the district that contains its inner point.
	update public.neighborhoods n
	set parent_id = d.id
	from public.neighborhoods d
	where n.city_id = p_city_id
		and n.kind = 'neighborhood'
		and d.city_id = p_city_id
		and d.kind = 'district'
		and extensions.st_contains(d.geom, extensions.st_pointonsurface(n.geom))
		and n.parent_id is distinct from d.id;

	select count(*) filter (where kind = 'district'), count(*) filter (where kind = 'neighborhood')
	into v_districts, v_neighborhoods
	from osm_areas;

	return jsonb_build_object(
		'districts', v_districts,
		'neighborhoods', v_neighborhoods,
		'outside_city', v_outside,
		'invalid', v_invalid
	);
end;
$$;

-- Assigns every place of the city to the neighborhood that contains it.
create function public.assign_place_neighborhoods(p_city_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
	v_changed integer;
begin
	update public.places p
	set neighborhood_id = (
		select n.id
		from public.neighborhoods n
		where n.city_id = p.city_id
			and n.kind = 'neighborhood'
			and extensions.st_contains(n.geom, p.geom)
		limit 1
	)
	where p.city_id = p_city_id
		and p.neighborhood_id is distinct from (
			select n.id
			from public.neighborhoods n
			where n.city_id = p.city_id
				and n.kind = 'neighborhood'
				and extensions.st_contains(n.geom, p.geom)
			limit 1
		);
	get diagnostics v_changed = row_count;

	return (
		select jsonb_build_object(
			'changed', v_changed,
			'with_neighborhood', count(*) filter (where neighborhood_id is not null),
			'without_neighborhood', count(*) filter (where neighborhood_id is null)
		)
		from public.places
		where city_id = p_city_id
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for service_role (the secret key, used only by scripts/). Automatic exposure is off,
-- so it has nothing by default: give it only what the import needs. No deletes anywhere.
-- ---------------------------------------------------------------------------

grant select on public.cities to service_role;
grant update (boundary, last_osm_import_at, osm_data_at) on public.cities to service_role;
grant select, insert, update on public.places to service_role;
grant select, insert, update on public.neighborhoods to service_role;

revoke execute on function
	public.import_osm_boundaries(uuid, jsonb, jsonb),
	public.assign_place_neighborhoods(uuid)
	from public, anon, authenticated;
grant execute on function
	public.import_osm_boundaries(uuid, jsonb, jsonb),
	public.assign_place_neighborhoods(uuid)
	to service_role;
-- The places insert trigger checks who is calling.
grant execute on function public.is_api_caller(), public.is_admin() to service_role;
