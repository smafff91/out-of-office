/**
 * Turns what submit_contribution (or the network) says into one of the messages the form
 * shows. The database raises stable messages (supabase/migrations/20261026120000_contributions.sql).
 */

export type ContributeErrorKind =
	| 'offline'
	| 'daily_limit'
	| 'email_not_confirmed'
	| 'place_not_found'
	/** The session ended: sign in again. */
	| 'not_signed_in'
	| 'sign_in_cancelled'
	| 'unknown';

type ErrorLike = { code?: string; message?: string };

const FROM_DATABASE = new Set<ContributeErrorKind>([
	'daily_limit',
	'email_not_confirmed',
	'place_not_found',
	'not_signed_in'
]);

/** @param online navigator.onLine, passed in so the function stays pure */
export function contributeErrorKind(
	error: unknown,
	{ online = true }: { online?: boolean } = {}
): ContributeErrorKind {
	if (!online) return 'offline';
	const { code, message = '' } = (error ?? {}) as ErrorLike;
	if (FROM_DATABASE.has(message as ContributeErrorKind)) return message as ContributeErrorKind;
	// No answer from the server (fetch failed): supabase-js returns it without a code.
	if ((error instanceof TypeError || !code) && /fetch|network|load failed/i.test(message)) {
		return 'offline';
	}
	// An expired or missing session reaches the database as the anon role.
	if (code === '42501' || code === 'PGRST301' || code === 'PGRST303') return 'not_signed_in';
	return 'unknown';
}
