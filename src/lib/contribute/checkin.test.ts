import { describe, expect, it } from 'vitest';
import type { LngLat } from '#lib/map/types.ts';
import { checkinView } from './checkin.ts';

const PLACE: LngLat = [2.17, 41.39];
const THRESHOLDS = { radiusM: 100, maxAccuracyM: 100 };
/** About `meters` north of the place. */
const north = (meters: number, accuracy = 10) => ({
	ok: true as const,
	position: { lat: PLACE[1] + meters / 111_195, lng: PLACE[0], accuracy }
});

describe('checkinView', () => {
	it('is here within 100 m with an accuracy of 100 m or better', () => {
		expect(checkinView(north(35), PLACE, THRESHOLDS)).toEqual({ state: 'here', meters: 35 });
		expect(checkinView(north(99, 100), PLACE, THRESHOLDS).state).toBe('here');
	});

	it('is far beyond 100 m, with the distance', () => {
		expect(checkinView(north(101), PLACE, THRESHOLDS)).toEqual({ state: 'far', meters: 101 });
		expect(checkinView(north(1200), PLACE, THRESHOLDS)).toEqual({ state: 'far', meters: 1200 });
	});

	it('is imprecise when the accuracy is worse than 100 m or invalid', () => {
		expect(checkinView(north(20, 101), PLACE, THRESHOLDS).state).toBe('imprecise');
		expect(checkinView(north(20, Number.NaN), PLACE, THRESHOLDS).state).toBe('imprecise');
		expect(checkinView(north(20, -1), PLACE, THRESHOLDS).state).toBe('imprecise');
	});

	it('is unavailable without a position', () => {
		for (const reason of ['denied', 'unavailable', 'timeout', 'unsupported'] as const) {
			expect(checkinView({ ok: false, reason }, PLACE, THRESHOLDS)).toEqual({
				state: 'unavailable'
			});
		}
	});
});
