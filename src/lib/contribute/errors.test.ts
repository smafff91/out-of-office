import { describe, expect, it } from 'vitest';
import { contributeErrorKind } from './errors.ts';

describe('contributeErrorKind', () => {
	it('reads the messages raised by the database', () => {
		for (const kind of ['daily_limit', 'email_not_confirmed', 'place_not_found', 'not_signed_in']) {
			expect(contributeErrorKind({ code: 'P0001', message: kind })).toBe(kind);
		}
	});

	it('is offline without a network', () => {
		expect(contributeErrorKind({ message: 'nope' }, { online: false })).toBe('offline');
		expect(contributeErrorKind({ code: '', message: 'TypeError: Failed to fetch' })).toBe(
			'offline'
		);
		expect(contributeErrorKind(new TypeError('Load failed'))).toBe('offline');
	});

	it('asks to sign in again when the session is gone', () => {
		expect(contributeErrorKind({ code: '42501', message: 'permission denied for function' })).toBe(
			'not_signed_in'
		);
		expect(contributeErrorKind({ code: 'PGRST303', message: 'JWT expired' })).toBe('not_signed_in');
	});

	it('falls back to unknown', () => {
		expect(contributeErrorKind({ code: '22023', message: 'invalid_laptop_rules' })).toBe('unknown');
		expect(contributeErrorKind(undefined)).toBe('unknown');
	});
});
