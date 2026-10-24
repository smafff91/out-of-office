import { describe, expect, it } from 'vitest';
import { isCompleteCode, normalizeCode } from './code.ts';

describe('normalizeCode', () => {
	it.each([
		['627909', '627909'],
		['627 909', '627909'],
		['\u200b627909', '627909'],
		['627909\u00a0', '627909'],
		['\u200e627909\u200f', '627909'],
		['\ufeff627\u00a0909', '627909'],
		['Your code: 627909', '627909'],
		['Your 6-digit code: 627909', '627909'],
		['６２７９０９', '627909'],
		['62790912', '627909'],
		['627-9', '6279'],
		['', '']
	])('%j → %j', (raw, expected) => {
		const code = normalizeCode(raw);
		expect(code).toBe(expected);
		expect(code).toMatch(/^[0-9]{0,6}$/);
	});
});

describe('isCompleteCode', () => {
	it('needs exactly six ASCII digits', () => {
		expect(isCompleteCode('627909')).toBe(true);
		expect(isCompleteCode('62790')).toBe(false);
		expect(isCompleteCode('６２７９０９')).toBe(false);
	});
});
