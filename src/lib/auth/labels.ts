// Message for each sign-in error (errors.ts).
import * as m from '#lib/paraglide/messages.js';
import type { AuthErrorKind } from './errors.ts';

export const AUTH_ERROR_TEXT: Record<AuthErrorKind, () => string> = {
	wrong_code: m.auth_error_wrong_code,
	expired_code: m.auth_error_expired_code,
	too_many: m.auth_error_too_many,
	send_failed: m.auth_error_send_failed,
	google_cancelled: m.auth_error_google_cancelled,
	offline: m.auth_error_offline,
	unknown: m.auth_error_unknown
};

/** "Too many attempts", with the wait when it is known: seconds under a minute, then minutes. */
export function tooManyText(seconds: number | undefined): string {
	if (seconds === undefined || seconds <= 0) return m.auth_error_too_many();
	return seconds < 60
		? m.auth_error_too_many_seconds({ seconds })
		: m.auth_error_too_many_minutes({ minutes: Math.ceil(seconds / 60) });
}
