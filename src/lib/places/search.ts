/**
 * Search that ignores accents, case and apostrophes: "Gracia" finds "Gràcia", "corts" and
 * "les corts" find "les Corts", "lantiga" and "l'antiga" both find "l'Antiga Esquerra…".
 */

/** Lowercase, no accents, apostrophes dropped, other punctuation turned into single spaces. */
export function normalizeText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/['’`´]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** True when every word of the query appears in the name (in any order). */
export function matchesQuery(name: string, query: string): boolean {
	const words = normalizeText(query).split(' ').filter(Boolean);
	if (!words.length) return false;
	const haystack = normalizeText(name);
	return words.every((word) => haystack.includes(word));
}
