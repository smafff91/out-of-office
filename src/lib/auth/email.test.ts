import { describe, expect, it } from 'vitest';
import { looksLikeEmail } from './email.ts';

describe('looksLikeEmail', () => {
	it('accepts ordinary addresses and refuses obvious typos', () => {
		expect(looksLikeEmail('ana@example.com')).toBe(true);
		expect(looksLikeEmail(' ana.p+cafe@mail.co.uk ')).toBe(true);
		expect(looksLikeEmail('ana@example')).toBe(false);
		expect(looksLikeEmail('ana example.com')).toBe(false);
		expect(looksLikeEmail('@example.com')).toBe(false);
		expect(looksLikeEmail('')).toBe(false);
	});
});
