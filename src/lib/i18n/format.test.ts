import { describe, expect, it } from 'vitest';
import { formatMonth } from './format.ts';

describe('formatMonth', () => {
	it('never lets a line break split the month from the year', () => {
		expect(formatMonth('2026-10-01', 'en')).toBe('Oct 2026');
		expect(formatMonth('2026-10-01', 'es')).toBe('oct 2026');
		expect(formatMonth('2026-10-01', 'ca')).toBe('oct. del 2026');
	});
});
