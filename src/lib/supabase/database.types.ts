export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: '14.18';
	};
	public: {
		Tables: {
			certification_settings: {
				Row: {
					checkin_radius_m: number;
					city_id: string | null;
					id: string;
					manual_recheck_months: number;
					min_checkin_ratio: number;
					min_score: number;
					min_span_days: number;
					min_users: number;
					review_reports_count: number;
					review_reports_window_days: number;
					revoke_below_score: number;
					revoke_min_votes: number;
					revoke_window_months: number;
					score_min_votes: number;
					updated_at: string;
					vote_cooldown_days: number;
				};
				Insert: {
					checkin_radius_m: number;
					city_id?: string | null;
					id?: string;
					manual_recheck_months: number;
					min_checkin_ratio: number;
					min_score: number;
					min_span_days: number;
					min_users: number;
					review_reports_count: number;
					review_reports_window_days: number;
					revoke_below_score: number;
					revoke_min_votes: number;
					revoke_window_months: number;
					score_min_votes: number;
					updated_at?: string;
					vote_cooldown_days: number;
				};
				Update: {
					checkin_radius_m?: number;
					city_id?: string | null;
					id?: string;
					manual_recheck_months?: number;
					min_checkin_ratio?: number;
					min_score?: number;
					min_span_days?: number;
					min_users?: number;
					review_reports_count?: number;
					review_reports_window_days?: number;
					revoke_below_score?: number;
					revoke_min_votes?: number;
					revoke_window_months?: number;
					score_min_votes?: number;
					updated_at?: string;
					vote_cooldown_days?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'certification_settings_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: true;
						referencedRelation: 'cities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'certification_settings_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: true;
						referencedRelation: 'city_summaries';
						referencedColumns: ['id'];
					}
				];
			};
			cities: {
				Row: {
					bbox: unknown;
					boundary: unknown;
					center: unknown;
					country_code: string;
					created_at: string;
					district_admin_level: number | null;
					id: string;
					is_active: boolean;
					last_osm_import_at: string | null;
					name: string;
					neighborhood_admin_level: number | null;
					osm_data_at: string | null;
					osm_relation_id: number | null;
					slug: string;
					timezone: string;
				};
				Insert: {
					bbox: unknown;
					boundary?: unknown;
					center: unknown;
					country_code: string;
					created_at?: string;
					district_admin_level?: number | null;
					id?: string;
					is_active?: boolean;
					last_osm_import_at?: string | null;
					name: string;
					neighborhood_admin_level?: number | null;
					osm_data_at?: string | null;
					osm_relation_id?: number | null;
					slug: string;
					timezone: string;
				};
				Update: {
					bbox?: unknown;
					boundary?: unknown;
					center?: unknown;
					country_code?: string;
					created_at?: string;
					district_admin_level?: number | null;
					id?: string;
					is_active?: boolean;
					last_osm_import_at?: string | null;
					name?: string;
					neighborhood_admin_level?: number | null;
					osm_data_at?: string | null;
					osm_relation_id?: number | null;
					slug?: string;
					timezone?: string;
				};
				Relationships: [];
			};
			city_votes: {
				Row: {
					city_name: string;
					country_code: string | null;
					created_at: string;
					id: string;
					user_id: string;
				};
				Insert: {
					city_name: string;
					country_code?: string | null;
					created_at?: string;
					id?: string;
					user_id?: string;
				};
				Update: {
					city_name?: string;
					country_code?: string | null;
					created_at?: string;
					id?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'city_votes_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			contributions: {
				Row: {
					anon_key: string | null;
					checked_in: boolean;
					checkin_distance_m: number | null;
					created_at: string;
					extras: Database['public']['Enums']['place_extra'][];
					id: string;
					laptop_rules: Database['public']['Enums']['laptop_rule'][] | null;
					long_stays: Database['public']['Enums']['long_stays'];
					noise: Database['public']['Enums']['noise_level'];
					note: string | null;
					outlets: Database['public']['Enums']['outlets_level'];
					place_id: string;
					user_id: string | null;
					wifi: Database['public']['Enums']['wifi_level'];
					would_work_again: boolean;
				};
				Insert: {
					anon_key?: string | null;
					checked_in?: boolean;
					checkin_distance_m?: number | null;
					created_at?: string;
					extras?: Database['public']['Enums']['place_extra'][];
					id?: string;
					laptop_rules?: Database['public']['Enums']['laptop_rule'][] | null;
					long_stays: Database['public']['Enums']['long_stays'];
					noise: Database['public']['Enums']['noise_level'];
					note?: string | null;
					outlets: Database['public']['Enums']['outlets_level'];
					place_id: string;
					user_id?: string | null;
					wifi: Database['public']['Enums']['wifi_level'];
					would_work_again: boolean;
				};
				Update: {
					anon_key?: string | null;
					checked_in?: boolean;
					checkin_distance_m?: number | null;
					created_at?: string;
					extras?: Database['public']['Enums']['place_extra'][];
					id?: string;
					laptop_rules?: Database['public']['Enums']['laptop_rule'][] | null;
					long_stays?: Database['public']['Enums']['long_stays'];
					noise?: Database['public']['Enums']['noise_level'];
					note?: string | null;
					outlets?: Database['public']['Enums']['outlets_level'];
					place_id?: string;
					user_id?: string | null;
					wifi?: Database['public']['Enums']['wifi_level'];
					would_work_again?: boolean;
				};
				Relationships: [
					{
						foreignKeyName: 'contributions_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'contributions_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			neighborhoods: {
				Row: {
					city_id: string;
					created_at: string;
					geom: unknown;
					id: string;
					kind: Database['public']['Enums']['neighborhood_kind'];
					name: string;
					osm_relation_id: number;
					parent_id: string | null;
					short_name: string | null;
					updated_at: string;
				};
				Insert: {
					city_id: string;
					created_at?: string;
					geom: unknown;
					id?: string;
					kind: Database['public']['Enums']['neighborhood_kind'];
					name: string;
					osm_relation_id: number;
					parent_id?: string | null;
					short_name?: string | null;
					updated_at?: string;
				};
				Update: {
					city_id?: string;
					created_at?: string;
					geom?: unknown;
					id?: string;
					kind?: Database['public']['Enums']['neighborhood_kind'];
					name?: string;
					osm_relation_id?: number;
					parent_id?: string | null;
					short_name?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'neighborhoods_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'cities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'neighborhoods_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'city_summaries';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'neighborhoods_parent_id_fkey';
						columns: ['parent_id'];
						isOneToOne: false;
						referencedRelation: 'neighborhood_summaries';
						referencedColumns: ['district_id'];
					},
					{
						foreignKeyName: 'neighborhoods_parent_id_fkey';
						columns: ['parent_id'];
						isOneToOne: false;
						referencedRelation: 'neighborhood_summaries';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'neighborhoods_parent_id_fkey';
						columns: ['parent_id'];
						isOneToOne: false;
						referencedRelation: 'neighborhoods';
						referencedColumns: ['id'];
					}
				];
			};
			photos: {
				Row: {
					contribution_id: string | null;
					created_at: string;
					height: number | null;
					id: string;
					place_id: string;
					status: Database['public']['Enums']['photo_status'];
					storage_path: string;
					user_id: string;
					width: number | null;
				};
				Insert: {
					contribution_id?: string | null;
					created_at?: string;
					height?: number | null;
					id?: string;
					place_id: string;
					status?: Database['public']['Enums']['photo_status'];
					storage_path: string;
					user_id?: string;
					width?: number | null;
				};
				Update: {
					contribution_id?: string | null;
					created_at?: string;
					height?: number | null;
					id?: string;
					place_id?: string;
					status?: Database['public']['Enums']['photo_status'];
					storage_path?: string;
					user_id?: string;
					width?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'photos_contribution_id_fkey';
						columns: ['contribution_id'];
						isOneToOne: false;
						referencedRelation: 'contributions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'photos_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'photos_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			places: {
				Row: {
					added_by: string | null;
					address: string | null;
					amenity: Database['public']['Enums']['place_amenity'] | null;
					cert_origin: Database['public']['Enums']['cert_origin'] | null;
					certified_at: string | null;
					city_id: string;
					created_at: string;
					geom: unknown;
					id: string;
					instagram: string | null;
					internet_access_osm: string | null;
					lat: number | null;
					level: Database['public']['Enums']['place_level'];
					lng: number | null;
					name: string;
					neighborhood_id: string | null;
					opening_hours: string | null;
					osm_id: number | null;
					osm_missing_since: string | null;
					osm_type: Database['public']['Enums']['osm_type'] | null;
					phone: string | null;
					review_status: Database['public']['Enums']['review_status'];
					revoked_at: string | null;
					slug: string;
					updated_at: string;
					website: string | null;
				};
				Insert: {
					added_by?: string | null;
					address?: string | null;
					amenity?: Database['public']['Enums']['place_amenity'] | null;
					cert_origin?: Database['public']['Enums']['cert_origin'] | null;
					certified_at?: string | null;
					city_id: string;
					created_at?: string;
					geom: unknown;
					id?: string;
					instagram?: string | null;
					internet_access_osm?: string | null;
					lat?: number | null;
					level?: Database['public']['Enums']['place_level'];
					lng?: number | null;
					name: string;
					neighborhood_id?: string | null;
					opening_hours?: string | null;
					osm_id?: number | null;
					osm_missing_since?: string | null;
					osm_type?: Database['public']['Enums']['osm_type'] | null;
					phone?: string | null;
					review_status?: Database['public']['Enums']['review_status'];
					revoked_at?: string | null;
					slug: string;
					updated_at?: string;
					website?: string | null;
				};
				Update: {
					added_by?: string | null;
					address?: string | null;
					amenity?: Database['public']['Enums']['place_amenity'] | null;
					cert_origin?: Database['public']['Enums']['cert_origin'] | null;
					certified_at?: string | null;
					city_id?: string;
					created_at?: string;
					geom?: unknown;
					id?: string;
					instagram?: string | null;
					internet_access_osm?: string | null;
					lat?: number | null;
					level?: Database['public']['Enums']['place_level'];
					lng?: number | null;
					name?: string;
					neighborhood_id?: string | null;
					opening_hours?: string | null;
					osm_id?: number | null;
					osm_missing_since?: string | null;
					osm_type?: Database['public']['Enums']['osm_type'] | null;
					phone?: string | null;
					review_status?: Database['public']['Enums']['review_status'];
					revoked_at?: string | null;
					slug?: string;
					updated_at?: string;
					website?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'places_added_by_fkey';
						columns: ['added_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'places_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'cities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'places_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'city_summaries';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'places_neighborhood_id_fkey';
						columns: ['neighborhood_id'];
						isOneToOne: false;
						referencedRelation: 'neighborhood_summaries';
						referencedColumns: ['district_id'];
					},
					{
						foreignKeyName: 'places_neighborhood_id_fkey';
						columns: ['neighborhood_id'];
						isOneToOne: false;
						referencedRelation: 'neighborhood_summaries';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'places_neighborhood_id_fkey';
						columns: ['neighborhood_id'];
						isOneToOne: false;
						referencedRelation: 'neighborhoods';
						referencedColumns: ['id'];
					}
				];
			};
			profiles: {
				Row: {
					created_at: string;
					display_name: string | null;
					founding_contributor: boolean;
					id: string;
					role: Database['public']['Enums']['user_role'];
				};
				Insert: {
					created_at?: string;
					display_name?: string | null;
					founding_contributor?: boolean;
					id: string;
					role?: Database['public']['Enums']['user_role'];
				};
				Update: {
					created_at?: string;
					display_name?: string | null;
					founding_contributor?: boolean;
					id?: string;
					role?: Database['public']['Enums']['user_role'];
				};
				Relationships: [];
			};
			reports: {
				Row: {
					contribution_id: string | null;
					created_at: string;
					id: string;
					note: string | null;
					photo_id: string | null;
					place_id: string;
					reason: Database['public']['Enums']['report_reason'];
					reporter_id: string | null;
					resolved_at: string | null;
					status: Database['public']['Enums']['report_status'];
				};
				Insert: {
					contribution_id?: string | null;
					created_at?: string;
					id?: string;
					note?: string | null;
					photo_id?: string | null;
					place_id: string;
					reason: Database['public']['Enums']['report_reason'];
					reporter_id?: string | null;
					resolved_at?: string | null;
					status?: Database['public']['Enums']['report_status'];
				};
				Update: {
					contribution_id?: string | null;
					created_at?: string;
					id?: string;
					note?: string | null;
					photo_id?: string | null;
					place_id?: string;
					reason?: Database['public']['Enums']['report_reason'];
					reporter_id?: string | null;
					resolved_at?: string | null;
					status?: Database['public']['Enums']['report_status'];
				};
				Relationships: [
					{
						foreignKeyName: 'reports_contribution_id_fkey';
						columns: ['contribution_id'];
						isOneToOne: false;
						referencedRelation: 'contributions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'reports_photo_id_fkey';
						columns: ['photo_id'];
						isOneToOne: false;
						referencedRelation: 'photos';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'reports_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'reports_reporter_id_fkey';
						columns: ['reporter_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: {
			city_ranking: {
				Row: {
					city_id: string | null;
					section: string | null;
					slug: string | null;
					votes: number | null;
					wilson: number | null;
					yes_votes: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'places_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'cities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'places_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'city_summaries';
						referencedColumns: ['id'];
					}
				];
			};
			city_summaries: {
				Row: {
					center_lat: number | null;
					center_lng: number | null;
					certified_count: number | null;
					community_count: number | null;
					east: number | null;
					id: string | null;
					name: string | null;
					north: number | null;
					places_count: number | null;
					slug: string | null;
					south: number | null;
					unchecked_count: number | null;
					west: number | null;
				};
				Relationships: [];
			};
			neighborhood_summaries: {
				Row: {
					certified_count: number | null;
					city_id: string | null;
					district_id: string | null;
					district_name: string | null;
					east: number | null;
					id: string | null;
					name: string | null;
					north: number | null;
					places_count: number | null;
					south: number | null;
					west: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'neighborhoods_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'cities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'neighborhoods_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'city_summaries';
						referencedColumns: ['id'];
					}
				];
			};
			place_attributes: {
				Row: {
					attribute: string | null;
					confirmations: number | null;
					last_confirmed_on: string | null;
					place_id: string | null;
					value: string | null;
				};
				Relationships: [];
			};
			place_laptop_rules: {
				Row: {
					confirmations: number | null;
					last_confirmed_on: string | null;
					place_id: string | null;
					rule: Database['public']['Enums']['laptop_rule'] | null;
				};
				Relationships: [
					{
						foreignKeyName: 'contributions_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					}
				];
			};
			place_list_items: {
				Row: {
					amenity: Database['public']['Enums']['place_amenity'] | null;
					city_id: string | null;
					has_score: boolean | null;
					laptop_rules: string[] | null;
					lat: number | null;
					level: Database['public']['Enums']['place_level'] | null;
					lng: number | null;
					name: string | null;
					neighborhood: string | null;
					noise: string | null;
					opening_hours: string | null;
					outlets: string | null;
					score_pct: number | null;
					slug: string | null;
					timezone: string | null;
					votes: number | null;
					wifi: string | null;
					yes_votes: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'places_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'cities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'places_city_id_fkey';
						columns: ['city_id'];
						isOneToOne: false;
						referencedRelation: 'city_summaries';
						referencedColumns: ['id'];
					}
				];
			};
			place_notes: {
				Row: {
					author_name: string | null;
					created_on: string | null;
					note: string | null;
					place_id: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'contributions_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					}
				];
			};
			place_scores: {
				Row: {
					place_id: string | null;
					score_pct: number | null;
					votes: number | null;
					yes_votes: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'contributions_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Functions: {
			assign_place_neighborhoods: { Args: { p_city_id: string }; Returns: Json };
			city_center_places: {
				Args: { p_city_id: string; p_limit?: number };
				Returns: {
					amenity: Database['public']['Enums']['place_amenity'] | null;
					city_id: string | null;
					has_score: boolean | null;
					laptop_rules: string[] | null;
					lat: number | null;
					level: Database['public']['Enums']['place_level'] | null;
					lng: number | null;
					name: string | null;
					neighborhood: string | null;
					noise: string | null;
					opening_hours: string | null;
					outlets: string | null;
					score_pct: number | null;
					slug: string | null;
					timezone: string | null;
					votes: number | null;
					wifi: string | null;
					yes_votes: number | null;
				}[];
				SetofOptions: {
					from: '*';
					to: 'place_list_items';
					isOneToOne: false;
					isSetofReturn: true;
				};
			};
			city_map_places: { Args: { p_city_id: string }; Returns: Json };
			import_osm_boundaries: {
				Args: { p_areas: Json; p_city_id: string; p_city_lines: Json };
				Returns: Json;
			};
			is_admin: { Args: never; Returns: boolean };
			is_api_caller: { Args: never; Returns: boolean };
			locate_city: { Args: { p_lat: number; p_lng: number }; Returns: string };
			score_min_votes: { Args: { p_city_id: string }; Returns: number };
			wilson_lower_bound: {
				Args: { p_total: number; p_yes: number };
				Returns: number;
			};
		};
		Enums: {
			cert_origin: 'manual' | 'community';
			laptop_rule: 'no_laptops_lunch' | 'no_laptops_weekends' | 'time_limit' | 'none';
			long_stays: 'welcome' | 'not_really';
			neighborhood_kind: 'district' | 'neighborhood';
			noise_level: 'quiet' | 'noisy';
			osm_type: 'node' | 'way' | 'relation';
			outlets_level: 'none' | 'a_few' | 'plenty';
			photo_status: 'visible' | 'hidden';
			place_amenity: 'cafe' | 'bar';
			place_extra: 'air_conditioning' | 'toilet' | 'large_tables' | 'minimum_spend';
			place_level: 'osm_only' | 'community' | 'certified';
			report_reason:
				| 'closed_permanently'
				| 'wrong_hours'
				| 'wrong_location'
				| 'laptops_not_allowed'
				| 'inappropriate_content'
				| 'other';
			report_status: 'open' | 'resolved' | 'dismissed';
			review_status: 'pending' | 'approved' | 'rejected';
			user_role: 'user' | 'admin';
			wifi_level: 'none' | 'slow' | 'fast';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends (DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never) = never
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never) = never
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {
			cert_origin: ['manual', 'community'],
			laptop_rule: ['no_laptops_lunch', 'no_laptops_weekends', 'time_limit', 'none'],
			long_stays: ['welcome', 'not_really'],
			neighborhood_kind: ['district', 'neighborhood'],
			noise_level: ['quiet', 'noisy'],
			osm_type: ['node', 'way', 'relation'],
			outlets_level: ['none', 'a_few', 'plenty'],
			photo_status: ['visible', 'hidden'],
			place_amenity: ['cafe', 'bar'],
			place_extra: ['air_conditioning', 'toilet', 'large_tables', 'minimum_spend'],
			place_level: ['osm_only', 'community', 'certified'],
			report_reason: [
				'closed_permanently',
				'wrong_hours',
				'wrong_location',
				'laptops_not_allowed',
				'inappropriate_content',
				'other'
			],
			report_status: ['open', 'resolved', 'dismissed'],
			review_status: ['pending', 'approved', 'rejected'],
			user_role: ['user', 'admin'],
			wifi_level: ['none', 'slow', 'fast']
		}
	}
} as const;
