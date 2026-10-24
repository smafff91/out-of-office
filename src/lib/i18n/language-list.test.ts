import { describe, expect, it } from 'vitest';
import {
	buildLanguageList,
	filterLanguages,
	languageEntries,
	languageName
} from './language-list.ts';

const TODAY = ['en', 'es', 'ca'];
const MANY = ['en', 'es', 'ca', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'sv', 'da', 'eu', 'gl'];

describe('languageName', () => {
	it('gives native and local names with a capital letter', () => {
		expect(languageName('ca', 'ca')).toBe('Català');
		expect(languageName('ca', 'en')).toBe('Catalan');
		expect(languageName('es', 'es')).toBe('Español');
	});

	it('falls back to the code in capitals without Intl.DisplayNames', () => {
		expect(languageName('ca', 'en', null)).toBe('CA');
		const Broken = function () {
			throw new RangeError('no data');
		} as unknown as typeof Intl.DisplayNames;
		expect(languageName('ca', 'en', Broken)).toBe('CA');
		expect(languageEntries(['ca'], 'en', null)).toEqual([
			{ locale: 'ca', nativeName: 'CA', localName: 'CA' }
		]);
	});
});

describe('buildLanguageList', () => {
	it('shows one list, sorted by native name, up to 6 languages', () => {
		const list = buildLanguageList({ locales: TODAY, displayLocale: 'en' });
		expect(list.layout).toBe('single');
		expect(list.all.map((e) => e.nativeName)).toEqual(['Català', 'English', 'Español']);
		expect(buildLanguageList({ locales: MANY.slice(0, 6), displayLocale: 'en' }).layout).toBe(
			'single'
		);
	});

	it('groups from 7 languages, with search from 11', () => {
		const seven = buildLanguageList({ locales: MANY.slice(0, 7), displayLocale: 'en' });
		expect(seven).toMatchObject({ layout: 'grouped', searchable: false });
		const ten = buildLanguageList({ locales: MANY.slice(0, 10), displayLocale: 'en' });
		expect(ten).toMatchObject({ layout: 'grouped', searchable: false });
		const eleven = buildLanguageList({ locales: MANY.slice(0, 11), displayLocale: 'en' });
		expect(eleven).toMatchObject({ layout: 'grouped', searchable: true });
	});

	it('suggests the supported browser languages, then the city languages, once each', () => {
		const list = buildLanguageList({
			locales: MANY,
			displayLocale: 'en',
			browser: ['fr-CA', 'ja', 'es-ES', 'fr'],
			city: ['ca', 'es']
		});
		if (list.layout !== 'grouped') throw new Error('expected groups');
		expect(list.suggested.map((e) => e.locale)).toEqual(['fr', 'es', 'ca']);
		// "All languages" still lists everything, by native name.
		expect(list.all).toHaveLength(MANY.length);
		const names = list.all.map((e) => e.nativeName);
		expect(names).toEqual(
			names.toSorted((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
		);
	});
});

describe('filterLanguages', () => {
	const entries = languageEntries(MANY, 'en');

	it('matches native names, local names and codes without accents', () => {
		expect(filterLanguages(entries, 'catala').map((e) => e.locale)).toEqual(['ca']);
		expect(filterLanguages(entries, 'GERMAN').map((e) => e.locale)).toEqual(['de']);
		expect(filterLanguages(entries, 'deutsch').map((e) => e.locale)).toEqual(['de']);
		expect(filterLanguages(entries, 'eu').map((e) => e.locale)).toContain('eu');
		expect(filterLanguages(entries, '  ')).toHaveLength(MANY.length);
	});
});
