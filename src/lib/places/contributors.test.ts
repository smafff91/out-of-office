import { describe, expect, it } from 'vitest';
import { joinNames } from './contributors.ts';

const others = (count: number) => `${count} others`;

describe('joinNames', () => {
	it('is empty without names', () => {
		expect(joinNames([], { locale: 'en', others })).toBeUndefined();
	});

	it('shows up to three names', () => {
		expect(joinNames(['Luca'], { locale: 'en', others })).toBe('Luca');
		expect(joinNames(['Luca', 'Ana'], { locale: 'en', others })).toBe('Luca and Ana');
		expect(joinNames(['Luca', 'Ana', 'Marc'], { locale: 'en', others })).toBe(
			'Luca, Ana, and Marc'
		);
	});

	it('shows two names and the others beyond three', () => {
		expect(joinNames(['Luca', 'Ana', 'Marc', 'Pau', 'Zoe'], { locale: 'en', others })).toBe(
			'Luca, Ana, and 3 others'
		);
	});

	it('joins in the active language', () => {
		expect(joinNames(['Luca', 'Ana'], { locale: 'es', others })).toBe('Luca y Ana');
		expect(joinNames(['Luca', 'Ana'], { locale: 'ca', others })).toBe('Luca i Ana');
		expect(
			joinNames(['Luca', 'Ana', 'Marc', 'Pau'], { locale: 'es', others: (n) => `${n} más` })
		).toBe('Luca, Ana y 2 más');
		expect(
			joinNames(['Luca', 'Ana', 'Marc', 'Pau'], { locale: 'ca', others: (n) => `${n} més` })
		).toBe('Luca, Ana i 2 més');
	});
});
