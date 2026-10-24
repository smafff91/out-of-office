import { describe, expect, it } from 'vitest';
import { pickEmailLocale } from './email-locale.ts';

const locales = ['en', 'es', 'ca'];
const callback = 'http://localhost:5173/auth/callback?next=%2Fbarcelona';
const pick = (redirectTo: string | undefined, metadataLocale?: unknown) =>
	pickEmailLocale({ redirectTo, metadataLocale, locales });

describe('pickEmailLocale', () => {
	it('uses the language of the page over the profile (the reported bug)', () => {
		expect(pick(`${callback}&lang=en`, 'es')).toBe('en');
		expect(pick(`${callback}&lang=ca`, 'en')).toBe('ca');
	});

	it('accepts case and region variants of an available language', () => {
		expect(pick(`${callback}&lang=ES`)).toBe('es');
		expect(pick(`${callback}&lang=es-ES`)).toBe('es');
		expect(pick(`${callback}&lang=ca_ES`)).toBe('ca');
	});

	it('falls back to the profile language, then English', () => {
		expect(pick(`${callback}&lang=fr`, 'ca')).toBe('ca');
		expect(pick(`${callback}&lang=`, 'es')).toBe('es');
		expect(pick(callback, 'es')).toBe('es');
		expect(pick(callback)).toBe('en');
		expect(pick(`${callback}&lang=fr`, 'de')).toBe('en');
		expect(pick(callback, 42)).toBe('en');
	});

	it('takes the first lang when it is repeated', () => {
		expect(pick(`${callback}&lang=ca&lang=es`)).toBe('ca');
	});

	it('ignores a missing or malformed URL', () => {
		expect(pick(undefined, 'ca')).toBe('ca');
		expect(pick('', 'ca')).toBe('ca');
		expect(pick('not a url?lang=es', 'ca')).toBe('ca');
	});

	it('reads lang from an app link too', () => {
		expect(pick('outofoffice://auth/callback?next=%2F&lang=es', 'en')).toBe('es');
		expect(pick('https://example.com/auth/callback?lang=ca#token_hash=x', 'en')).toBe('ca');
	});
});
