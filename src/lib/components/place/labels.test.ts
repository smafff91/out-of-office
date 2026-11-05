import { afterEach, describe, expect, it } from 'vitest';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { openingLabel } from './labels.ts';

const TZ = 'Europe/Madrid';
const HOURS = 'Mo-Fr 08:30-17:00; Sa 09:00-14:00';
/** 2026-10-15 is a Thursday in Barcelona (CEST, UTC+2). */
const at = (isoLocal: string) => new Date(`${isoLocal}+02:00`);
const label = (when: string, form: 'long' | 'short' = 'long', hours = HOURS) =>
	openingLabel(hours, TZ, { form, now: at(when) })?.replace(/\u202f/g, ' ');

describe('openingLabel', () => {
	afterEach(() => overwriteGetLocale(() => 'en'));

	it('tells each moment of the day apart', () => {
		expect(label('2026-10-15T07:00')).toBe('Opens at 8:30 AM');
		expect(label('2026-10-15T12:00')).toBe('Open until 5:00 PM');
		expect(label('2026-10-15T17:06')).toBe('Closed · Opens tomorrow at 8:30 AM');
		expect(label('2026-10-18T12:00')).toBe('Closed today');
	});

	it('names the day when the next opening is not tomorrow', () => {
		expect(label('2026-10-17T15:00')).toBe('Closed · Opens Monday at 8:30 AM');
	});

	it('has a short form for the rows of the list', () => {
		expect(label('2026-10-15T17:06', 'short')).toBe('Opens tomorrow 8:30 AM');
		expect(label('2026-10-17T15:00', 'short')).toBe('Opens Mon 8:30 AM');
		expect(label('2026-10-15T07:00', 'short')).toBe('Opens at 8:30 AM');
		expect(label('2026-10-18T12:00', 'short')).toBe('Closed today');
	});

	it('uses the 24-hour clock in Spanish and Catalan', () => {
		overwriteGetLocale(() => 'es');
		expect(label('2026-10-15T17:06')).toBe('Cerrado · Abre mañana a las 8:30');
		expect(label('2026-10-17T15:00')).toBe('Cerrado · Abre el lunes a las 8:30');
		expect(label('2026-10-17T15:00', 'short')).toBe('Abre lun 8:30');
		overwriteGetLocale(() => 'ca');
		expect(label('2026-10-15T17:06')).toBe('Tancat · Obre demà a les 8:30');
		expect(label('2026-10-17T15:00')).toBe('Tancat · Obre dilluns a les 8:30');
		expect(label('2026-10-17T15:00', 'short')).toBe('Obre dl. 8:30');
	});

	it('shows nothing for hours it cannot read with certainty', () => {
		expect(openingLabel('Mo-Fr 08:00-20:00; PH off', TZ)).toBeUndefined();
		expect(openingLabel(null, TZ)).toBeUndefined();
	});
});
