import { describe, expect, it } from 'vitest';
import type { PlaceDetail } from '#lib/supabase/place-details.ts';
import {
	DRAFT_MAX_AGE_MS,
	canConfirmAll,
	confirmAll,
	emptyDraft,
	firstMissing,
	matchStoredPhotos,
	noteLength,
	parseDraft,
	prefill,
	sameDraft,
	toggleExtra,
	toggleRule,
	type Draft,
	type MyContribution,
	type StashedDraft
} from './draft.ts';

const DAY = '2026-10-20';

function place(overrides: Partial<PlaceDetail> = {}): PlaceDetail {
	return {
		id: 'p1',
		slug: 'cafe',
		name: 'Café',
		amenity: 'cafe',
		level: 'community',
		certOrigin: null,
		certifiedOn: null,
		removedOn: null,
		canGetCertified: true,
		neighborhood: null,
		district: null,
		address: null,
		point: [2.17, 41.39],
		openingHours: null,
		timezone: 'Europe/Madrid',
		internetAccessOsm: null,
		osm: null,
		mayHaveClosed: false,
		votes: 3,
		yesVotes: 2,
		scorePct: 67,
		hasScore: false,
		contributors: 3,
		minUsers: 10,
		attributes: {
			wifi: { value: 'fast', confirmations: 3, lastConfirmedOn: DAY },
			outlets: { value: 'plenty', confirmations: 2, lastConfirmedOn: DAY },
			noise: { value: 'quiet', confirmations: 3, lastConfirmedOn: DAY },
			long_stays: { value: 'welcome', confirmations: 2, lastConfirmedOn: DAY }
		},
		laptopRules: [
			{ rule: 'no_laptops_lunch', confirmations: 2, lastConfirmedOn: DAY },
			{ rule: 'time_limit', confirmations: 2, lastConfirmedOn: DAY, hours: 2 }
		],
		extras: [],
		checkin: { radiusM: 100, maxAccuracyM: 100 },
		photoPaths: [],
		photoCount: 0,
		...overrides
	};
}

const MINE: MyContribution = {
	workAgain: false,
	wifi: 'slow',
	outlets: 'none',
	noise: 'noisy',
	longStays: 'not_really',
	rules: ['none'],
	extras: ['toilet'],
	note: 'Upstairs'
};

describe('prefill', () => {
	it('takes what the community reported, without the vote', () => {
		const { draft, source } = prefill(place());
		expect(source).toBe('community');
		expect(draft.workAgain).toBeUndefined();
		expect(draft).toMatchObject({
			wifi: 'fast',
			outlets: 'plenty',
			noise: 'quiet',
			longStays: 'welcome',
			rules: ['no_laptops_lunch', 'time_limit'],
			hours: 2,
			extras: [],
			note: ''
		});
	});

	it("prefers the user's own recent answers", () => {
		const { draft, source } = prefill(place(), MINE);
		expect(source).toBe('mine');
		expect(draft).toEqual({ ...MINE, hours: undefined });
	});

	it('leaves everything to choose on a place without info', () => {
		const { draft, source } = prefill(place({ attributes: {}, laptopRules: [] }));
		expect(source).toBe('none');
		expect(draft).toEqual(emptyDraft());
	});

	it('leaves unknown attributes to choose', () => {
		const { draft, source } = prefill(
			place({ attributes: { wifi: { value: 'slow', confirmations: 1, lastConfirmedOn: DAY } } })
		);
		expect(source).toBe('community');
		expect(draft.wifi).toBe('slow');
		expect(draft.outlets).toBeUndefined();
	});
});

describe("Everything's still right", () => {
	it('is offered only when all four attributes are known', () => {
		expect(canConfirmAll(prefill(place()).draft)).toBe(true);
		const partial = place({ attributes: { ...place().attributes, noise: undefined } });
		expect(canConfirmAll(prefill(partial).draft)).toBe(false);
		expect(canConfirmAll(emptyDraft())).toBe(false);
	});

	it('takes back the four prefilled attributes and keeps the rest', () => {
		const initial = prefill(place()).draft;
		const changed: Draft = { ...initial, workAgain: true, wifi: 'none', note: 'Hi' };
		expect(confirmAll(changed, initial)).toEqual({ ...initial, workAgain: true, note: 'Hi' });
	});
});

describe('toggleRule', () => {
	it('"No rules" clears the rules and the hours', () => {
		const draft = { ...emptyDraft(), rules: ['no_laptops_lunch', 'time_limit'], hours: 2 } as Draft;
		expect(toggleRule(draft, 'none')).toMatchObject({ rules: ['none'], hours: undefined });
	});

	it('a rule clears "No rules"', () => {
		const draft = { ...emptyDraft(), rules: ['none'] } as Draft;
		expect(toggleRule(draft, 'no_laptops_weekends').rules).toEqual(['no_laptops_weekends']);
	});

	it('turns a rule off, and the hours with the time limit', () => {
		const draft = { ...emptyDraft(), rules: ['time_limit', 'no_laptops_lunch'], hours: 3 } as Draft;
		expect(toggleRule(draft, 'time_limit')).toMatchObject({
			rules: ['no_laptops_lunch'],
			hours: undefined
		});
		expect(toggleRule(draft, 'no_laptops_lunch')).toMatchObject({
			rules: ['time_limit'],
			hours: 3
		});
	});

	it('keeps the order of the chips', () => {
		let draft = emptyDraft();
		draft = toggleRule(draft, 'time_limit');
		draft = toggleRule(draft, 'no_laptops_lunch');
		expect(draft.rules).toEqual(['no_laptops_lunch', 'time_limit']);
	});
});

describe('toggleExtra', () => {
	it('adds and removes details in the order of the chips', () => {
		let draft = toggleExtra(emptyDraft(), 'minimum_spend');
		draft = toggleExtra(draft, 'toilet');
		expect(draft.extras).toEqual(['toilet', 'minimum_spend']);
		expect(toggleExtra(draft, 'toilet').extras).toEqual(['minimum_spend']);
	});
});

describe('firstMissing', () => {
	it('follows the order of the form', () => {
		expect(firstMissing(emptyDraft())).toBe('workAgain');
		expect(firstMissing({ ...prefill(place()).draft })).toBe('workAgain');
		expect(firstMissing({ ...prefill(place()).draft, workAgain: true })).toBeUndefined();
		expect(firstMissing({ ...emptyDraft(), workAgain: false, wifi: 'fast' })).toBe('outlets');
	});
});

describe('noteLength', () => {
	it('counts characters as the database does', () => {
		expect(noteLength('café')).toBe(4);
		expect(noteLength('☕️👍')).toBe(3);
	});
});

describe('sameDraft', () => {
	it('ignores the order of chips and spaces around the note', () => {
		const a = { ...emptyDraft(), rules: ['time_limit', 'no_laptops_lunch'], note: ' Hi ' } as Draft;
		const b = { ...emptyDraft(), rules: ['no_laptops_lunch', 'time_limit'], note: 'Hi' } as Draft;
		expect(sameDraft(a, b)).toBe(true);
		expect(sameDraft(a, { ...b, wifi: 'fast' })).toBe(false);
	});
});

const PHOTO_1 = '0b6c2f8e-4a1d-4c3b-9e2f-1a2b3c4d5e6f';
const PHOTO_2 = '7f3e9d1c-2b4a-4f6e-8d0c-6e5d4c3b2a19';
const PHOTO_3 = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';

describe('parseDraft', () => {
	const now = Date.UTC(2026, 9, 24, 12);
	const saved: StashedDraft = {
		v: 1,
		placeId: 'p1',
		savedAt: now - 1000,
		draft: { ...prefill(place()).draft, workAgain: true },
		initial: prefill(place()).draft,
		source: 'community',
		pendingSubmit: true,
		wantsLocation: true,
		photoIds: [PHOTO_1, PHOTO_2]
	};
	const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

	it('restores a recent draft of the same place', () => {
		expect(parseDraft(roundTrip(saved), { placeId: 'p1', now })).toEqual(saved);
	});

	it('ignores another place, an old draft or garbage', () => {
		expect(parseDraft(roundTrip(saved), { placeId: 'p2', now })).toBeUndefined();
		expect(
			parseDraft(roundTrip(saved), { placeId: 'p1', now: now + DRAFT_MAX_AGE_MS })
		).toBeUndefined();
		expect(parseDraft('nope', { placeId: 'p1', now })).toBeUndefined();
		expect(parseDraft({ ...saved, v: 2 }, { placeId: 'p1', now })).toBeUndefined();
	});

	it('drops unknown values and keeps "No rules" exclusive', () => {
		const tampered = {
			...saved,
			draft: {
				wifi: 'super',
				rules: ['none', 'time_limit', 'x'],
				hours: 9,
				extras: ['pool'],
				note: 'a'.repeat(200)
			}
		};
		const parsed = parseDraft(tampered, { placeId: 'p1', now });
		expect(parsed?.draft).toEqual({
			workAgain: undefined,
			wifi: undefined,
			outlets: undefined,
			noise: undefined,
			longStays: undefined,
			rules: ['time_limit'],
			hours: undefined,
			extras: [],
			note: 'a'.repeat(140)
		});
	});

	it('keeps the photo ids, at most 3, and drops anything else', () => {
		const tampered = {
			...saved,
			photoIds: [PHOTO_1, 'x', 42, PHOTO_2, '../../etc', PHOTO_3, PHOTO_1]
		};
		expect(parseDraft(tampered, { placeId: 'p1', now })?.photoIds).toEqual([
			PHOTO_1,
			PHOTO_2,
			PHOTO_3
		]);
	});

	it('a draft saved before photos existed has none', () => {
		const old: Partial<StashedDraft> = { ...saved };
		delete old.photoIds;
		expect(parseDraft(roundTrip(old), { placeId: 'p1', now })?.photoIds).toEqual([]);
	});
});

describe('matchStoredPhotos', () => {
	const stored = [{ id: PHOTO_2 }, { id: PHOTO_1 }, { id: PHOTO_3 }];

	it("gives back the draft's photos in the draft's order", () => {
		expect(matchStoredPhotos([PHOTO_1, PHOTO_2], stored)).toEqual({
			photos: [{ id: PHOTO_1 }, { id: PHOTO_2 }],
			missing: 0
		});
	});

	it('counts the photos the browser could not keep', () => {
		expect(matchStoredPhotos([PHOTO_1, PHOTO_2], [])).toEqual({ photos: [], missing: 2 });
		expect(matchStoredPhotos([PHOTO_1, PHOTO_2], [{ id: PHOTO_2 }])).toEqual({
			photos: [{ id: PHOTO_2 }],
			missing: 1
		});
	});

	it('ignores stored photos the draft no longer lists (removed with ×)', () => {
		expect(matchStoredPhotos([PHOTO_3], stored)).toEqual({ photos: [{ id: PHOTO_3 }], missing: 0 });
	});
});
