-- Seed data. Safe to run more than once.

-- Launch city. osm_relation_id is the Barcelona municipality boundary on OpenStreetMap;
-- districtes are admin_level 9 and barris admin_level 10.
insert into public.cities (
	slug,
	name,
	country_code,
	timezone,
	center,
	bbox,
	osm_relation_id,
	district_admin_level,
	neighborhood_admin_level,
	is_active,
	languages,
	certified_filter_default
)
values (
	'barcelona',
	'Barcelona',
	'ES',
	'Europe/Madrid',
	extensions.st_setsrid(extensions.st_makepoint(2.1686, 41.3874), 4326),
	extensions.st_makeenvelope(2.0524, 41.3170, 2.2280, 41.4682, 4326),
	347950,
	9,
	10,
	true,
	'{ca,es}',
	true
)
on conflict (slug) do nothing;

-- Default certification thresholds (docs/certificazione.md, v3.1).
insert into public.certification_settings (
	city_id,
	min_users,
	min_checkin_ratio,
	min_span_days,
	min_score,
	revoke_below_score,
	revoke_min_votes,
	revoke_window_months,
	review_reports_count,
	review_reports_window_days,
	manual_recheck_months,
	vote_cooldown_days,
	checkin_radius_m,
	score_min_votes,
	checkin_max_accuracy_m,
	daily_contribution_limit,
	founding_limit,
	photos_per_contribution,
	daily_photo_limit,
	photos_per_user_place,
	revoke_recent_days,
	revoke_recent_min,
	removed_notice_days,
	daytime_from_hour,
	daytime_to_hour,
	daytime_min_hours,
	daytime_min_weekdays
)
values (null, 10, 0.50, 14, 0.75, 0.60, 10, 12, 2, 30, 12, 30, 100, 5, 100, 20, 50, 3, 15, 3, 90, 3, 90, 8, 18, 4, 3)
on conflict (city_id) do nothing;
