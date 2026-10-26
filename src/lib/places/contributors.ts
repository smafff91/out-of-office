/**
 * "Luca and Ana", "Luca, Ana and Marc", "Luca, Ana and 3 others": the public names of a place
 * (place_contributors), joined the way the active language joins a list. Only names: never a
 * date or an identifier next to them.
 */

/** Up to this many names are all shown; beyond, the first two and "N others". */
export const MAX_NAMES = 3;

export function joinNames(
	names: readonly string[],
	{ locale, others }: { locale: string; others: (count: number) => string }
): string | undefined {
	if (!names.length) return undefined;
	const parts =
		names.length > MAX_NAMES ? [names[0], names[1], others(names.length - 2)] : [...names];
	return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts);
}
