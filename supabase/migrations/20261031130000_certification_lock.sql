-- Fix for 20261031120000_certification.sql: simultaneous submissions on the same place could
-- deadlock. Each submission's new contribution takes a KEY SHARE lock on the place (its foreign
-- key); recompute_place_certification() then asked FOR UPDATE on the same row, which conflicts
-- with KEY SHARE, so two submissions waited for each other. FOR NO KEY UPDATE does not conflict
-- with KEY SHARE and still makes recomputes of one place wait for each other (each one then
-- sees the other's contribution). The team's functions lock the place the same way.
-- Same functions, only the lock changes.

create or replace function public.recompute_place_certification(p_place_id uuid)
returns public.place_level
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_place public.places;
	v_has_contributions boolean;
	v_revocation jsonb;
begin
	select * into v_place from public.places p where p.id = p_place_id for no key update;
	if not found then
		return null;
	end if;
	v_has_contributions := exists (
		select 1 from public.counted_contributions c where c.place_id = p_place_id
	);

	if v_place.level = 'certified' then
		-- Revocation, for both origins. cert_origin and certified_at stay as history.
		v_revocation := public.revocation_check(p_place_id);
		if v_revocation is not null then
			update public.places
			set
				level = case when v_has_contributions then 'community' else 'osm_only' end::public.place_level,
				revoked_at = now(),
				revoked_notice = true
			where id = p_place_id;
			perform public.log_level_change(v_place, 'revoked', v_revocation ->> 'reason', 'system');
		elsif v_place.cert_origin = 'picked'
			and (public.certification_check(p_place_id) ->> 'meets')::boolean then
			update public.places set cert_origin = 'confirmed', certified_at = now() where id = p_place_id;
			perform public.log_level_change(v_place, 'confirmed', 'conditions_met', 'system');
		end if;
	elsif not v_place.auto_cert_blocked
		and (public.certification_check(p_place_id) ->> 'meets')::boolean then
		update public.places
		set
			level = 'certified',
			cert_origin = 'confirmed',
			certified_at = now(),
			revoked_at = null,
			revoked_notice = false
		where id = p_place_id;
		perform public.log_level_change(v_place, 'certified', 'conditions_met', 'system');
	elsif v_place.level = 'osm_only' and v_has_contributions then
		update public.places set level = 'community' where id = p_place_id;
		perform public.log_level_change(v_place, 'level_up', 'first_contribution', 'system');
	end if;

	return (select p.level from public.places p where p.id = p_place_id);
end;
$$;

create or replace function public.pick_place(p_place_id uuid, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_actor text := public.require_certification_actor();
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_place public.places;
	v_revocation jsonb;
	v_level public.place_level;
begin
	if v_note is null then
		raise exception 'note_required' using errcode = '22023';
	end if;
	select * into v_place from public.places p where p.id = p_place_id for no key update;
	if not found or v_place.review_status <> 'approved' then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	if v_place.osm_missing_since is not null then
		raise exception 'place_missing_from_osm' using errcode = 'P0001';
	end if;
	if v_place.level = 'certified' and v_place.cert_origin = 'confirmed' then
		raise exception 'already_confirmed' using errcode = 'P0001';
	end if;
	v_revocation := public.revocation_check(p_place_id);
	if v_revocation is not null then
		raise exception 'would_be_revoked' using errcode = 'P0001', detail = v_revocation::text;
	end if;

	update public.places
	set
		level = 'certified',
		cert_origin = 'picked',
		certified_at = now(),
		revoked_at = null,
		revoked_notice = false,
		auto_cert_blocked = false
	where id = p_place_id;
	perform public.log_level_change(
		v_place, 'picked', case when v_place.level = 'certified' then 'renewed' end, v_actor, v_note
	);
	if v_place.auto_cert_blocked then
		perform public.log_level_change(
			(select p from public.places p where p.id = p_place_id), 'unblocked', 'picked', v_actor
		);
	end if;

	v_level := public.recompute_place_certification(p_place_id);
	return jsonb_build_object(
		'level', v_level,
		'origin', (select p.cert_origin from public.places p where p.id = p_place_id),
		'renewed', v_place.level = 'certified',
		'unblocked', v_place.auto_cert_blocked
	);
end;
$$;

create or replace function public.unpick_place(
	p_place_id uuid,
	p_reason text,
	p_block boolean default false,
	p_notice boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_actor text := public.require_certification_actor();
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_place public.places;
	v_block boolean;
begin
	if v_reason is null then
		raise exception 'reason_required' using errcode = '22023';
	end if;
	select * into v_place from public.places p where p.id = p_place_id for no key update;
	if not found then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	if v_place.level <> 'certified' then
		raise exception 'not_certified' using errcode = 'P0001';
	end if;
	v_block := coalesce(p_block, false) or v_place.cert_origin = 'confirmed';

	update public.places p
	set
		level = case
			when exists (select 1 from public.counted_contributions c where c.place_id = p.id)
				then 'community'
			else 'osm_only'
		end::public.place_level,
		revoked_at = now(),
		revoked_notice = coalesce(p_notice, true),
		auto_cert_blocked = v_block
	where p.id = p_place_id;
	perform public.log_level_change(v_place, 'unpicked', v_reason, v_actor);
	if v_block and not v_place.auto_cert_blocked then
		perform public.log_level_change(
			(select p from public.places p where p.id = p_place_id), 'blocked', v_reason, v_actor
		);
	end if;

	return jsonb_build_object(
		'level', (select p.level from public.places p where p.id = p_place_id),
		'blocked', v_block,
		'notice', coalesce(p_notice, true)
	);
end;
$$;

create or replace function public.unblock_place(p_place_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_actor text := public.require_certification_actor();
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_place public.places;
begin
	if v_reason is null then
		raise exception 'reason_required' using errcode = '22023';
	end if;
	select * into v_place from public.places p where p.id = p_place_id for no key update;
	if not found then
		raise exception 'place_not_found' using errcode = 'P0001';
	end if;
	if not v_place.auto_cert_blocked then
		raise exception 'not_blocked' using errcode = 'P0001';
	end if;
	update public.places set auto_cert_blocked = false where id = p_place_id;
	perform public.log_level_change(v_place, 'unblocked', v_reason, v_actor);
	return jsonb_build_object('level', public.recompute_place_certification(p_place_id));
end;
$$;
