/**
 * The 6-digit sign-in code, from whatever was typed, pasted or filled in by the system
 * ("one-time-code"). Mail apps often copy invisible characters (zero-width spaces, direction
 * marks, no-break spaces) or text around the code: only ASCII digits are kept, then the length
 * limit applies, so a stray character never pushes the last digit out.
 */
export const CODE_LENGTH = 6;

export function normalizeCode(raw: string): string {
	const text = raw
		// Full-width and other compatibility digits become 0-9.
		.normalize('NFKC')
		// Invisible format characters (zero-width spaces, direction marks…).
		.replace(/\p{Cf}/gu, '')
		// "627 909": spaces between digits are formatting, not separators.
		.replace(/(?<=[0-9])\s+(?=[0-9])/g, '');
	// Text around the code ("Your 6-digit code: 627909"): a run of exactly 6 digits wins.
	const runs = text.match(/[0-9]+/g) ?? [];
	const exact = runs.find((run) => run.length === CODE_LENGTH);
	return (exact ?? runs.join('')).slice(0, CODE_LENGTH);
}

export const isCompleteCode = (code: string) => /^[0-9]{6}$/.test(code);
