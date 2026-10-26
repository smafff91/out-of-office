/**
 * Sending a contribution and reading back one's own recent answers
 * (supabase/migrations/20261026120000_contributions.sql). The table itself is closed to the app:
 * everything goes through these two functions, and the database applies every rule.
 */
import type { Draft, Extra, MyContribution, RuleChoice } from '#lib/contribute/draft.ts';
import type { PlaceLevel } from '#lib/map/index.ts';
import type { Position } from '#lib/platform/geolocation.ts';
import type { createSupabaseClient } from './client.ts';

type Client = ReturnType<typeof createSupabaseClient>;

/** ~11 m of latitude (~8 m of longitude in Barcelona): plenty for the 100 m check-in rule. */
const roundCoordinate = (value: number) => Math.round(value * 10_000) / 10_000;
const finite = (value: number | undefined) =>
	value !== undefined && Number.isFinite(value) ? value : undefined;

export type SubmitResult = {
	verified: boolean;
	/** It replaced the user's own update of the last 30 days. */
	replaced: boolean;
	/** The Founding contributor badge came with this update. */
	founding: boolean;
	foundingLimit: number;
	level: PlaceLevel;
	/** Active answers equal to the user's, per attribute. */
	confirmations: { wifi: number; outlets: number; noise: number; longStays: number };
	contributors: number;
	minUsers: number;
	/** The new contribution: its photos are uploaded with it (src/lib/supabase/photos.ts). */
	id: string;
	/** Photos this update can still take today (3 at most). */
	photoSlots: number;
};

/** A complete draft (firstMissing() is undefined). */
export type CompleteDraft = Draft &
	Required<Pick<Draft, 'workAgain' | 'wifi' | 'outlets' | 'noise' | 'longStays'>>;

/**
 * Always a POST (the default for rpc; the database function refuses GET requests): the
 * position travels in the body, never in a URL. It is compared there and never stored.
 */
export async function submitContribution(
	supabase: Client,
	placeId: string,
	draft: CompleteDraft,
	position?: Position
): Promise<SubmitResult> {
	const lat = finite(position?.lat);
	const lng = finite(position?.lng);
	const accuracy = finite(position?.accuracy);
	const located = lat !== undefined && lng !== undefined;
	const { data, error } = await supabase.rpc('submit_contribution', {
		p_place_id: placeId,
		p_would_work_again: draft.workAgain,
		p_wifi: draft.wifi,
		p_outlets: draft.outlets,
		p_noise: draft.noise,
		p_long_stays: draft.longStays,
		...(draft.rules.length > 0 && { p_laptop_rules: draft.rules }),
		...(!!draft.hours && draft.rules.includes('time_limit') && { p_time_limit_hours: draft.hours }),
		...(draft.extras.length > 0 && { p_extras: draft.extras }),
		...(draft.note.trim() !== '' && { p_note: draft.note.trim() }),
		...(located && { p_lat: roundCoordinate(lat), p_lng: roundCoordinate(lng) }),
		...(located && accuracy !== undefined && accuracy >= 0 && { p_accuracy: accuracy })
	});
	if (error) throw error;
	const result = data as Record<string, unknown>;
	const confirmations = (result.confirmations ?? {}) as Record<string, number>;
	return {
		verified: result.verified === true,
		replaced: result.replaced === true,
		founding: result.founding === true,
		foundingLimit: Number(result.founding_limit ?? 0),
		level: (result.level as PlaceLevel) ?? 'community',
		confirmations: {
			wifi: confirmations.wifi ?? 1,
			outlets: confirmations.outlets ?? 1,
			noise: confirmations.noise ?? 1,
			longStays: confirmations.long_stays ?? 1
		},
		contributors: Number(result.contributors ?? 1),
		minUsers: Number(result.min_users ?? 10),
		id: String(result.id ?? ''),
		photoSlots: Number(result.photo_slots ?? 0)
	};
}

/** The signed-in user's own answers for this place, if they are less than 30 days old. */
export async function fetchMyRecentContribution(
	supabase: Client,
	placeId: string
): Promise<MyContribution | undefined> {
	const { data, error } = await supabase
		.rpc('my_recent_contribution', { p_place_id: placeId })
		.maybeSingle();
	if (error) throw error;
	if (!data) return undefined;
	const rules = (data.laptop_rules ?? []) as RuleChoice[];
	const hours = data.time_limit_hours;
	return {
		workAgain: data.would_work_again,
		wifi: data.wifi,
		outlets: data.outlets,
		noise: data.noise,
		longStays: data.long_stays,
		rules,
		hours: hours === 1 || hours === 2 || hours === 3 ? hours : undefined,
		extras: (data.extras ?? []) as Extra[],
		note: data.note ?? ''
	};
}
