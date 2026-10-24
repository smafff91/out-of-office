import { describe, expect, it } from 'vitest';
import { resolveLocale } from './locale-sync.ts';

describe('resolveLocale', () => {
	it('fills an empty profile with the language in use', () => {
		expect(resolveLocale({ current: 'es', profile: { locale: null } })).toEqual({
			action: 'save',
			locale: 'es',
			chosenAt: undefined
		});
		expect(
			resolveLocale({
				current: 'ca',
				device: { locale: 'ca', chosenAt: 5 },
				profile: { locale: null }
			})
		).toEqual({ action: 'save', locale: 'ca', chosenAt: 5 });
	});

	it('applies the profile on a device that never chose', () => {
		expect(resolveLocale({ current: 'en', profile: { locale: 'ca', chosenAt: 1 } })).toEqual({
			action: 'apply',
			locale: 'ca'
		});
		expect(resolveLocale({ current: 'ca', profile: { locale: 'ca' } })).toEqual({ action: 'none' });
	});

	it('lets the latest explicit choice win', () => {
		// Chosen here (signed out) after the profile was set elsewhere: the profile follows.
		expect(
			resolveLocale({
				current: 'es',
				device: { locale: 'es', chosenAt: 200 },
				profile: { locale: 'ca', chosenAt: 100 }
			})
		).toEqual({ action: 'save', locale: 'es', chosenAt: 200 });
		// Changed on another device later: this one switches.
		expect(
			resolveLocale({
				current: 'es',
				device: { locale: 'es', chosenAt: 100 },
				profile: { locale: 'ca', chosenAt: 200 }
			})
		).toEqual({ action: 'apply', locale: 'ca' });
	});

	it('treats an untimed device choice as the oldest', () => {
		expect(
			resolveLocale({ current: 'es', device: { locale: 'es' }, profile: { locale: 'ca' } })
		).toEqual({ action: 'apply', locale: 'ca' });
		expect(
			resolveLocale({
				current: 'es',
				device: { locale: 'es', chosenAt: 1 },
				profile: { locale: 'ca' }
			})
		).toEqual({ action: 'save', locale: 'es', chosenAt: 1 });
	});
});
