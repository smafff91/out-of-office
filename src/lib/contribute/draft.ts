/**
 * The contribution form as data (LatteContribute): the answers, how they are prefilled, the
 * laptop rules and details chips, what is still missing, and the draft kept across the Google
 * sign-in and the language reload (stash() in handoff.ts, this tab only). The photos themselves
 * are kept in IndexedDB (src/lib/photos/stored-photos.ts): the draft only lists their ids.
 * Pure: the database decides everything that counts (submit_contribution).
 */
import type { LongStays, PlaceDetail } from '#lib/supabase/place-details.ts';
import type { LaptopRule, Noise, Outlets, Wifi } from '#lib/supabase/places.ts';
import { PHOTOS_PER_CONTRIBUTION } from '#lib/config.ts';

/** A laptop rule chip: the three rules, or "No rules" on its own. */
export type RuleChoice = LaptopRule | 'none';
export type Extra = 'air_conditioning' | 'toilet' | 'large_tables' | 'minimum_spend';
export type TimeLimitHours = 1 | 2 | 3;

export const RULE_CHOICES: readonly RuleChoice[] = [
	'no_laptops_lunch',
	'no_laptops_weekends',
	'time_limit',
	'none'
];
export const EXTRAS: readonly Extra[] = [
	'air_conditioning',
	'toilet',
	'large_tables',
	'minimum_spend'
];
export const TIME_LIMIT_HOURS: readonly TimeLimitHours[] = [1, 2, 3];
export const WIFI: readonly Wifi[] = ['none', 'slow', 'fast'];
export const OUTLETS: readonly Outlets[] = ['none', 'a_few', 'plenty'];
export const NOISE: readonly Noise[] = ['quiet', 'noisy'];
export const LONG_STAYS: readonly LongStays[] = ['welcome', 'not_really'];

/** Same limit as the database (contributions.note). */
export const NOTE_MAX = 140;

export type Draft = {
	workAgain?: boolean;
	wifi?: Wifi;
	outlets?: Outlets;
	noise?: Noise;
	longStays?: LongStays;
	/** Empty: the question is not answered. */
	rules: RuleChoice[];
	/** Only with the time limit rule. */
	hours?: TimeLimitHours;
	extras: Extra[];
	note: string;
};

/** The required answers, in the order of the form. */
export const REQUIRED = ['workAgain', 'wifi', 'outlets', 'noise', 'longStays'] as const;
export type RequiredField = (typeof REQUIRED)[number];

/** The user's own active answers of the last 30 days (my_recent_contribution). */
export type MyContribution = {
	workAgain: boolean;
	wifi: Wifi;
	outlets: Outlets;
	noise: Noise;
	longStays: LongStays;
	rules: RuleChoice[];
	hours?: TimeLimitHours;
	extras: Extra[];
	note: string;
};

/**
 * Where the prefilled answers come from: the user's own recent update, what the community
 * reported (some attributes known), only what the team checked when it picked the place, or
 * nothing (a place without info).
 */
export type PrefillSource = 'mine' | 'community' | 'team' | 'none';

export function emptyDraft(): Draft {
	return { rules: [], extras: [], note: '' };
}

export function prefill(
	place: PlaceDetail,
	mine?: MyContribution
): { draft: Draft; source: PrefillSource } {
	if (mine) {
		return {
			source: 'mine',
			draft: {
				workAgain: mine.workAgain,
				wifi: mine.wifi,
				outlets: mine.outlets,
				noise: mine.noise,
				longStays: mine.longStays,
				rules: [...mine.rules],
				hours: mine.rules.includes('time_limit') ? mine.hours : undefined,
				extras: [...mine.extras],
				note: mine.note
			}
		};
	}
	const { wifi, outlets, noise, long_stays } = place.attributes;
	// The team's "Wi‑Fi available" says nothing about the speed: the user chooses.
	const answerable = wifi?.value === 'available' ? undefined : wifi;
	const rules = place.laptopRules.map((rule) => rule.rule);
	const draft: Draft = {
		...emptyDraft(),
		wifi: answerable?.value as Wifi | undefined,
		outlets: outlets?.value,
		noise: noise?.value,
		longStays: long_stays?.value,
		rules,
		hours: place.laptopRules.find((rule) => rule.rule === 'time_limit')?.hours
	};
	const used = [answerable, outlets, noise, long_stays, ...place.laptopRules].filter(
		(known) => !!known
	);
	const source: PrefillSource = used.some((known) => known.source === 'users')
		? 'community'
		: used.length
			? 'team'
			: 'none';
	return { source, draft };
}

/**
 * "Everything's still right" is offered only when all four attributes were prefilled (the
 * team's values count; its "Wi‑Fi available" is not prefilled).
 */
export function canConfirmAll(initial: Draft): boolean {
	return !!(initial.wifi && initial.outlets && initial.noise && initial.longStays);
}

/** Takes back the four prefilled attributes, keeping everything else. */
export function confirmAll(draft: Draft, initial: Draft): Draft {
	return {
		...draft,
		wifi: initial.wifi,
		outlets: initial.outlets,
		noise: initial.noise,
		longStays: initial.longStays
	};
}

/**
 * Toggles a laptop rule chip. "No rules" is exclusive: choosing it clears the rules, choosing
 * a rule clears "No rules". The hours go with the time limit.
 */
export function toggleRule(draft: Draft, rule: RuleChoice): Draft {
	const on = draft.rules.includes(rule);
	let rules: RuleChoice[];
	if (on) rules = draft.rules.filter((r) => r !== rule);
	else if (rule === 'none') rules = ['none'];
	else rules = [...draft.rules.filter((r) => r !== 'none'), rule];
	rules = RULE_CHOICES.filter((r) => rules.includes(r));
	return { ...draft, rules, hours: rules.includes('time_limit') ? draft.hours : undefined };
}

export function toggleExtra(draft: Draft, extra: Extra): Draft {
	const extras = draft.extras.includes(extra)
		? draft.extras.filter((e) => e !== extra)
		: [...draft.extras, extra];
	return { ...draft, extras: EXTRAS.filter((e) => extras.includes(e)) };
}

/** The first required answer still missing, in the order of the form. */
export function firstMissing(draft: Draft): RequiredField | undefined {
	return REQUIRED.find((field) => draft[field] === undefined);
}

/** Characters as the database counts them (code points, not UTF-16 units). */
export function noteLength(note: string): number {
	return [...note].length;
}

export function sameDraft(a: Draft, b: Draft): boolean {
	return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(draft: Draft): Draft {
	return {
		workAgain: draft.workAgain,
		wifi: draft.wifi,
		outlets: draft.outlets,
		noise: draft.noise,
		longStays: draft.longStays,
		rules: RULE_CHOICES.filter((r) => draft.rules.includes(r)),
		hours: draft.hours,
		extras: EXTRAS.filter((e) => draft.extras.includes(e)),
		note: draft.note.trim()
	};
}

// ---------------------------------------------------------------------------
// Kept across a page change (Google sign-in, language reload)
// ---------------------------------------------------------------------------

export const draftKey = (placeId: string) => `contribution:${placeId}`;
/** Signing in with a new Google account can take a while; older drafts are dropped. */
export const DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

export type StashedDraft = {
	v: 1;
	placeId: string;
	savedAt: number;
	draft: Draft;
	/** The prefilled answers, to tell whether the user changed anything. */
	initial: Draft;
	source: PrefillSource;
	/** "Send update" was tapped: carry on once signed in. */
	pendingSubmit: boolean;
	/** The user asked for their position (check-in or "I'm here now"). */
	wantsLocation: boolean;
	/** Local ids of the chosen photos, in order (the files are in IndexedDB). */
	photoIds: string[];
};

const oneOf = <T>(values: readonly T[], value: unknown): T | undefined =>
	values.includes(value as T) ? (value as T) : undefined;

function parseAnswers(raw: unknown): Draft | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const value = raw as Record<string, unknown>;
	const rules = Array.isArray(value.rules)
		? RULE_CHOICES.filter((r) => (value.rules as unknown[]).includes(r))
		: [];
	const extras = Array.isArray(value.extras)
		? EXTRAS.filter((e) => (value.extras as unknown[]).includes(e))
		: [];
	const note = typeof value.note === 'string' ? [...value.note].slice(0, NOTE_MAX).join('') : '';
	return {
		workAgain: typeof value.workAgain === 'boolean' ? value.workAgain : undefined,
		wifi: oneOf(WIFI, value.wifi),
		outlets: oneOf(OUTLETS, value.outlets),
		noise: oneOf(NOISE, value.noise),
		longStays: oneOf(LONG_STAYS, value.longStays),
		// "No rules" never comes with a rule.
		rules: rules.includes('none') && rules.length > 1 ? rules.filter((r) => r !== 'none') : rules,
		hours: rules.includes('time_limit') ? oneOf(TIME_LIMIT_HOURS, value.hours) : undefined,
		extras,
		note
	};
}

/** The saved draft of this place, or undefined if missing, stale, for another place or malformed. */
export function parseDraft(
	raw: unknown,
	{ placeId, now = Date.now() }: { placeId: string; now?: number }
): StashedDraft | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const value = raw as Record<string, unknown>;
	if (value.v !== 1 || value.placeId !== placeId) return undefined;
	if (typeof value.savedAt !== 'number' || now - value.savedAt > DRAFT_MAX_AGE_MS) return undefined;
	if (value.savedAt > now + 60_000) return undefined;
	const draft = parseAnswers(value.draft);
	const initial = parseAnswers(value.initial);
	const source = oneOf<PrefillSource>(['mine', 'community', 'team', 'none'], value.source);
	if (!draft || !initial || !source) return undefined;
	return {
		v: 1,
		placeId,
		savedAt: value.savedAt,
		draft,
		initial,
		source,
		pendingSubmit: value.pendingSubmit === true,
		wantsLocation: value.wantsLocation === true,
		photoIds: Array.isArray(value.photoIds)
			? value.photoIds
					.filter((id): id is string => typeof id === 'string' && PHOTO_ID.test(id))
					.slice(0, PHOTOS_PER_CONTRIBUTION)
			: []
	};
}

/** crypto.randomUUID(), the local id of a chosen photo. */
const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The photos of a restored draft: those found in the browser storage, in the draft's order, and
 * how many are missing (storage unavailable or cleared: the form asks to add them again).
 */
export function matchStoredPhotos<T extends { id: string }>(
	ids: readonly string[],
	stored: readonly T[]
): { photos: T[]; missing: number } {
	const photos = ids
		.map((id) => stored.find((photo) => photo.id === id))
		.filter((photo): photo is T => photo !== undefined);
	return { photos, missing: ids.length - photos.length };
}
