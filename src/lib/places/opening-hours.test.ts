import { describe, expect, it } from 'vitest';
import realValues from './opening-hours.fixtures.json' with { type: 'json' };
import { openingStatus, parseOpeningHours, weekdayIn, weekSchedule } from './opening-hours.ts';

const TZ = 'Europe/Madrid';
/** A moment in Barcelona: 2026-10-12 is a Monday (CEST, UTC+2). */
const at = (isoLocal: string) => new Date(`${isoLocal}+02:00`);

describe('openingStatus', () => {
	it('reads simple weekday rules in the city timezone', () => {
		const hours = 'Mo-Fr 08:00-20:00; Sa 09:00-14:00';
		expect(openingStatus(hours, TZ, at('2026-10-12T10:00'))).toEqual({
			state: 'open',
			until: '20:00'
		});
		expect(openingStatus(hours, TZ, at('2026-10-12T07:15'))).toEqual({
			state: 'opens',
			at: '08:00'
		});
		expect(openingStatus(hours, TZ, at('2026-10-12T21:00'))).toEqual({
			state: 'closed',
			inDays: 1,
			day: 1,
			at: '08:00'
		});
		expect(openingStatus(hours, TZ, at('2026-10-18T12:00'))).toEqual({ state: 'closed_today' });
	});

	it('says closed today only on a day without hours', () => {
		const hours = 'Mo-Fr 08:30-17:00; Sa 09:00-14:00; Su off';
		// Thursday at 17:06: it was open today, it is only closed now.
		expect(openingStatus(hours, TZ, at('2026-10-15T17:06'))?.state).toBe('closed');
		expect(openingStatus(hours, TZ, at('2026-10-18T09:00'))).toEqual({ state: 'closed_today' });
		expect(openingStatus(hours, TZ, at('2026-10-18T20:00'))).toEqual({ state: 'closed_today' });
	});

	it("finds the next opening after today's hours", () => {
		// Saturday: Sunday is closed, so the next opening is Monday, the earliest range of the day.
		expect(
			openingStatus('Mo 16:00-20:00, 08:30-12:00; Sa 09:00-14:00', TZ, at('2026-10-17T15:00'))
		).toEqual({ state: 'closed', inDays: 2, day: 0, at: '08:30' });
		// Open one day a week: the same day next week.
		expect(openingStatus('Fr 09:00-12:00', TZ, at('2026-10-16T13:00'))).toEqual({
			state: 'closed',
			inDays: 7,
			day: 4,
			at: '09:00'
		});
	});

	it('uses the city timezone, not the device one', () => {
		// 18:30 UTC is 20:30 in Barcelona: already closed there.
		expect(openingStatus('Mo-Fr 08:00-20:00', TZ, new Date('2026-10-12T18:30:00Z'))).toEqual({
			state: 'closed',
			inDays: 1,
			day: 1,
			at: '08:00'
		});
	});

	it('handles several ranges in a day and hours past midnight', () => {
		const split = 'Tu-Su 13:00-16:00, 20:00-23:30';
		expect(openingStatus(split, TZ, at('2026-10-13T17:00'))).toEqual({
			state: 'opens',
			at: '20:00'
		});
		const night = 'Fr-Sa 20:30-03:00';
		// Saturday 01:00: still open from Friday night.
		expect(openingStatus(night, TZ, at('2026-10-17T01:00'))).toEqual({
			state: 'open',
			until: '03:00'
		});
		expect(openingStatus('Mo-Su 07:00-00:00', TZ, at('2026-10-12T23:00'))).toEqual({
			state: 'open',
			until: '00:00'
		});
	});

	it('follows a place open until after midnight', () => {
		const daily = 'Mo-Su 18:00-01:00';
		expect(openingStatus(daily, TZ, at('2026-10-13T00:30'))).toEqual({
			state: 'open',
			until: '01:00'
		});
		expect(openingStatus(daily, TZ, at('2026-10-13T01:30'))).toEqual({
			state: 'opens',
			at: '18:00'
		});
		// Friday night only: Saturday is a day without hours once the night is over.
		const friday = 'Fr 20:00-01:00';
		expect(openingStatus(friday, TZ, at('2026-10-17T00:30'))).toEqual({
			state: 'open',
			until: '01:00'
		});
		expect(openingStatus(friday, TZ, at('2026-10-17T02:00'))).toEqual({ state: 'closed_today' });
	});

	it('lets later rules replace earlier ones and reads "off"', () => {
		const hours = 'Mo-Su 08:00-20:00; Su off';
		expect(openingStatus(hours, TZ, at('2026-10-18T12:00'))).toEqual({ state: 'closed_today' });
		expect(openingStatus(hours, TZ, at('2026-10-17T12:00'))).toEqual({
			state: 'open',
			until: '20:00'
		});
	});

	it('reads 24/7 and rules without days', () => {
		expect(openingStatus('24/7', TZ)).toEqual({ state: 'open_24h' });
		expect(openingStatus('07:00-22:00', TZ, at('2026-10-12T12:00'))).toEqual({
			state: 'open',
			until: '22:00'
		});
	});

	it('shows nothing when unsure', () => {
		for (const unsure of [
			'Mo-Su,PH 06:00-22:00',
			'Mo-Fr 08:00-20:00; PH off',
			'Tu-Fr',
			'Mo-Fr 08:00+',
			'Jan-Mar Mo-Fr 08:00-18:00',
			'"by appointment"',
			'Mo-Fr 08:00-20:00 || "call us"',
			'sunrise-sunset',
			''
		]) {
			expect(openingStatus(unsure, TZ), unsure).toBeUndefined();
		}
	});
});

describe('real OpenStreetMap values', () => {
	it('never throws, and reads most of them', () => {
		const values = realValues as string[];
		let read = 0;
		for (const value of values) {
			expect(() => openingStatus(value, TZ)).not.toThrow();
			if (parseOpeningHours(value)) read++;
		}
		// Most cafés use the simple shapes; the rest are left blank on purpose.
		expect(read / values.length).toBeGreaterThan(0.8);
	});
});

describe('weekSchedule', () => {
	it('lists the week from Monday, with closed days and hours past midnight', () => {
		const week = weekSchedule('Mo-Fr 08:00-20:00; Sa 18:00-02:30; Su off');
		expect(week?.map((d) => d.intervals)).toEqual([
			[['08:00', '20:00']],
			[['08:00', '20:00']],
			[['08:00', '20:00']],
			[['08:00', '20:00']],
			[['08:00', '20:00']],
			[['18:00', '02:30']],
			[]
		]);
		expect(week?.some((d) => d.allDay)).toBe(false);
	});

	it('sorts split hours and marks whole days', () => {
		expect(weekSchedule('Mo 16:00-20:00, 08:00-12:00')?.[0].intervals).toEqual([
			['08:00', '12:00'],
			['16:00', '20:00']
		]);
		expect(weekSchedule('24/7')?.every((d) => d.allDay)).toBe(true);
	});

	it('gives nothing for hours it cannot read with certainty', () => {
		expect(weekSchedule('Mo-Fr 08:00-20:00; PH off')).toBeUndefined();
		expect(weekSchedule(null)).toBeUndefined();
	});
});

describe('weekdayIn', () => {
	it('uses the city timezone', () => {
		// Sunday 23:30 UTC is already Monday in Barcelona.
		expect(weekdayIn(TZ, new Date('2026-10-11T23:30:00Z'))).toBe(0);
	});
});
