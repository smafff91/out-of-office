import { describe, expect, it } from 'vitest';
import realValues from './opening-hours.fixtures.json' with { type: 'json' };
import { openingStatus, parseOpeningHours } from './opening-hours.ts';

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
		expect(openingStatus(hours, TZ, at('2026-10-12T21:00'))).toEqual({ state: 'closed_today' });
		expect(openingStatus(hours, TZ, at('2026-10-18T12:00'))).toEqual({ state: 'closed_today' });
	});

	it('uses the city timezone, not the device one', () => {
		// 18:30 UTC is 20:30 in Barcelona: already closed there.
		expect(openingStatus('Mo-Fr 08:00-20:00', TZ, new Date('2026-10-12T18:30:00Z'))).toEqual({
			state: 'closed_today'
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
