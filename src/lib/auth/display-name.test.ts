import { describe, expect, it } from 'vitest';
import { displayNameProblem, normalizeDisplayName } from './display-name.ts';

describe('normalizeDisplayName', () => {
	it('trims and collapses spaces', () => {
		expect(normalizeDisplayName('  Ana   María ')).toBe('Ana María');
		expect(normalizeDisplayName('\tJordi\n')).toBe('Jordi');
	});
});

describe('displayNameProblem', () => {
	it('accepts first names up to 30 characters', () => {
		expect(displayNameProblem('Marta')).toBeUndefined();
		expect(displayNameProblem('Núria')).toBeUndefined();
		expect(displayNameProblem('a'.repeat(30))).toBeUndefined();
	});

	it('counts characters like Postgres (code points, not UTF-16 units)', () => {
		expect(displayNameProblem('😀'.repeat(30))).toBeUndefined();
		expect(displayNameProblem('😀'.repeat(31))).toBe('too_long');
	});

	it('refuses empty, too long, emails and control characters', () => {
		expect(displayNameProblem('')).toBe('empty');
		expect(displayNameProblem('a'.repeat(31))).toBe('too_long');
		expect(displayNameProblem('ana@example.com')).toBe('invalid');
		expect(displayNameProblem('Ana\u0000')).toBe('invalid');
	});
});
