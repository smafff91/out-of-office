/**
 * Turns what Supabase Auth (or the network) says into one of the messages the sign-in sheet
 * shows. Supabase answers "otp_expired" both for a wrong code and for an expired one, so the
 * time since the code was sent decides which.
 */
import { OTP_EXPIRY_SECONDS, VERIFY_LOCKOUT_SECONDS } from '#lib/config.ts';

export type AuthErrorKind =
	| 'wrong_code'
	| 'expired_code'
	| 'too_many'
	| 'send_failed'
	| 'google_cancelled'
	| 'offline'
	| 'unknown';

/** What the user was doing: the same error means different things. */
export type AuthAction = 'send' | 'verify' | 'google' | 'return';

type ErrorLike = { code?: string; status?: number; name?: string; message?: string };

// The address was refused or the email could not go out (SMTP, provider, server).
const SEND_FAILED_CODES = new Set([
	'unexpected_failure',
	'email_address_invalid',
	'email_address_not_authorized'
]);

/**
 * @param sentAt when the current code was sent (ms), if the error comes from checking a code
 * @param online navigator.onLine, passed in so the function stays pure
 */
export function authErrorKind(
	error: unknown,
	{
		action = 'verify',
		sentAt,
		now = Date.now(),
		online = true
	}: { action?: AuthAction; sentAt?: number; now?: number; online?: boolean } = {}
): AuthErrorKind {
	if (!online) return 'offline';
	const { code, status, name, message = '' } = (error ?? {}) as ErrorLike;

	// No answer from the server at all (supabase-js: retryable error without a status).
	if (
		(name === 'AuthRetryableFetchError' && !status) ||
		(error instanceof TypeError && /fetch|network|load failed/i.test(message))
	) {
		return 'offline';
	}
	if (
		status === 429 ||
		code === 'over_request_rate_limit' ||
		code === 'over_email_send_rate_limit'
	) {
		return 'too_many';
	}
	if (code === 'access_denied') return 'google_cancelled';
	if (code === 'otp_expired') {
		// No send time: an email link opened on the callback page, which only says "expired".
		if (sentAt === undefined || now - sentAt > OTP_EXPIRY_SECONDS * 1000) return 'expired_code';
		return 'wrong_code';
	}
	if (
		action === 'send' &&
		((status !== undefined && status >= 500) ||
			(code !== undefined && SEND_FAILED_CODES.has(code)) ||
			/error sending/i.test(message))
	) {
		return 'send_failed';
	}
	return 'unknown';
}

/**
 * How long to wait after "too many": Supabase says it for sends ("…after 47 seconds"); for
 * code checks it does not, so the verification window of the project applies.
 */
export function retryAfterSeconds(error: unknown, action: AuthAction): number | undefined {
	const { message = '' } = (error ?? {}) as ErrorLike;
	const stated = /after (\d+) seconds?/i.exec(message);
	if (stated) return Number(stated[1]);
	return action === 'verify' ? VERIFY_LOCKOUT_SECONDS : undefined;
}
