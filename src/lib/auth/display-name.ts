/**
 * Public name: first name only, 1–30 characters. The same rules as the check on
 * profiles.display_name (lengths counted in code points, like Postgres char_length).
 */
import { DISPLAY_NAME_MAX_LENGTH } from '#lib/config.ts';

export type DisplayNameProblem = 'empty' | 'too_long' | 'invalid';

/** Trims and collapses runs of spaces, so "  Ana   María " becomes "Ana María". */
export function normalizeDisplayName(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim();
}

export function displayNameProblem(name: string): DisplayNameProblem | undefined {
	if (name.length === 0) return 'empty';
	if ([...name].length > DISPLAY_NAME_MAX_LENGTH) return 'too_long';
	// No emails as names, no invisible characters.
	// eslint-disable-next-line no-control-regex
	if (name.includes('@') || /[\u0000-\u001f\u007f]/.test(name)) return 'invalid';
	return undefined;
}
