import { describe, expect, it } from 'vitest';
import { daysSince, todayIn } from './dates.ts';

const TZ = 'Europe/Madrid';

describe('daysSince', () => {
	it('counts calendar days in the city timezone', () => {
		// 23:30 UTC on the 16th is already the 17th in Barcelona.
		const now = new Date('2026-10-16T23:30:00Z');
		expect(todayIn(TZ, now)).toBe('2026-10-17');
		expect(daysSince('2026-10-17', TZ, now)).toBe(0);
		expect(daysSince('2026-10-14', TZ, now)).toBe(3);
	});

	it('crosses the daylight saving change without drifting', () => {
		expect(daysSince('2026-10-20', TZ, new Date('2026-10-27T10:00:00Z'))).toBe(7);
	});

	it('never goes below zero', () => {
		expect(daysSince('2026-10-20', TZ, new Date('2026-10-17T10:00:00Z'))).toBe(0);
	});
});
