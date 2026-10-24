import { describe, expect, it } from 'vitest';
import { OTP_EXPIRY_SECONDS, VERIFY_LOCKOUT_SECONDS } from '#lib/config.ts';
import { authErrorKind, retryAfterSeconds } from './errors.ts';

const otpExpired = { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' };

describe('authErrorKind', () => {
	it('tells a wrong code from an expired one by the time since sending', () => {
		const sentAt = 1_000_000;
		expect(authErrorKind(otpExpired, { sentAt, now: sentAt + 30_000 })).toBe('wrong_code');
		expect(authErrorKind(otpExpired, { sentAt, now: sentAt + OTP_EXPIRY_SECONDS * 1000 + 1 })).toBe(
			'expired_code'
		);
	});

	it('treats an email link that no longer works as expired', () => {
		expect(authErrorKind({ code: 'otp_expired' })).toBe('expired_code');
	});

	it('recognizes rate limits, cancellations and the network', () => {
		expect(authErrorKind({ status: 429 })).toBe('too_many');
		expect(authErrorKind({ code: 'over_email_send_rate_limit', status: 429 })).toBe('too_many');
		expect(authErrorKind({ code: 'access_denied' })).toBe('google_cancelled');
		expect(authErrorKind({ name: 'AuthRetryableFetchError' })).toBe('offline');
		expect(authErrorKind(new TypeError('Failed to fetch'))).toBe('offline');
		expect(authErrorKind(otpExpired, { online: false })).toBe('offline');
		expect(authErrorKind(new Error('boom'))).toBe('unknown');
		expect(authErrorKind(undefined)).toBe('unknown');
	});
});

describe('sending the email', () => {
	it('blames the server, not the network, when the email cannot go out', () => {
		const send = { action: 'send' as const };
		expect(authErrorKind({ status: 500, message: 'Error sending magic link email' }, send)).toBe(
			'send_failed'
		);
		expect(authErrorKind({ code: 'unexpected_failure', status: 500 }, send)).toBe('send_failed');
		expect(authErrorKind({ code: 'email_address_invalid', status: 400 }, send)).toBe('send_failed');
		// The Send Email Hook answers 500 when Resend refuses or does not answer: what Auth sends on.
		expect(
			authErrorKind(
				{ status: 500, message: 'Unexpected status code returned from hook: 500' },
				send
			)
		).toBe('send_failed');
		// supabase-js marks 502–504 as retryable, but the server did answer.
		expect(authErrorKind({ name: 'AuthRetryableFetchError', status: 504 }, send)).toBe(
			'send_failed'
		);
	});

	it('says offline only when nothing reached the server', () => {
		const send = { action: 'send' as const };
		expect(authErrorKind({ name: 'AuthRetryableFetchError', status: 0 }, send)).toBe('offline');
		expect(authErrorKind(new TypeError('Load failed'), send)).toBe('offline');
		expect(authErrorKind({ status: 500 }, { ...send, online: false })).toBe('offline');
	});
});

describe('retryAfterSeconds', () => {
	it('reads the wait Supabase states for sends', () => {
		const error = {
			code: 'over_email_send_rate_limit',
			status: 429,
			message: 'For security purposes, you can only request this after 47 seconds.'
		};
		expect(retryAfterSeconds(error, 'send')).toBe(47);
	});

	it('uses the verification window for codes, nothing for an unstated send wait', () => {
		expect(retryAfterSeconds({ status: 429 }, 'verify')).toBe(VERIFY_LOCKOUT_SECONDS);
		expect(retryAfterSeconds({ status: 429 }, 'send')).toBeUndefined();
	});
});
