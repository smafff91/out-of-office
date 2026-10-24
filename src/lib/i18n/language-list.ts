/**
 * The language picker's content, built from the locales Paraglide compiles (never a list in
 * the code). Names come from Intl.DisplayNames: the native name ("Català") and the name in the
 * language on screen ("Catalan"). Without Intl.DisplayNames the code stands in ("CA").
 *
 * Up to 6 languages: one list. More: "Suggested" (the browser's languages we support, then the
 * city's) and "All languages" by native name. More than 10: a search field on top.
 */

export const SINGLE_LIST_MAX = 6;
export const SEARCH_MIN = 11;

export type LanguageEntry = { locale: string; nativeName: string; localName: string };

export type LanguageList =
	| { layout: 'single'; all: LanguageEntry[] }
	| { layout: 'grouped'; suggested: LanguageEntry[]; all: LanguageEntry[]; searchable: boolean };

// null: this runtime has no Intl.DisplayNames (tests pass it to check the fallback).
type DisplayNamesCtor = typeof Intl.DisplayNames | null;

const defaultDisplayNames = (): DisplayNamesCtor =>
	typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function' ? Intl.DisplayNames : null;

/** One language's name in a given language, or its code in capitals if Intl cannot say. */
export function languageName(
	locale: string,
	inLocale: string,
	displayNames: DisplayNamesCtor = defaultDisplayNames()
): string {
	try {
		const name = displayNames && new displayNames([inLocale], { type: 'language' }).of(locale);
		if (name && name !== locale) {
			return name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1);
		}
	} catch {
		// Missing locale data or no Intl.DisplayNames in this runtime.
	}
	return locale.toUpperCase();
}

export function languageEntries(
	locales: readonly string[],
	displayLocale: string,
	displayNames: DisplayNamesCtor = defaultDisplayNames()
): LanguageEntry[] {
	return locales.map((locale) => ({
		locale,
		nativeName: languageName(locale, locale, displayNames),
		localName: languageName(locale, displayLocale, displayNames)
	}));
}

/** "es-ES" → "es" when only "es" exists; exact matches first. */
function supported(tag: string, locales: readonly string[]): string | undefined {
	const lower = tag.toLowerCase();
	return (
		locales.find((locale) => locale.toLowerCase() === lower) ??
		locales.find((locale) => locale.toLowerCase() === lower.split('-')[0])
	);
}

export function buildLanguageList({
	locales,
	displayLocale,
	browser = [],
	city = [],
	displayNames = defaultDisplayNames()
}: {
	locales: readonly string[];
	/** The language on screen: names are given in it, and sorting follows it. */
	displayLocale: string;
	/** navigator.languages, most preferred first. */
	browser?: readonly string[];
	/** The current city's languages (cities.languages), if any. */
	city?: readonly string[];
	displayNames?: DisplayNamesCtor;
}): LanguageList {
	const entries = languageEntries(locales, displayLocale, displayNames);
	const collator = new Intl.Collator(displayLocale, { sensitivity: 'base' });
	const all = entries.toSorted((a, b) => collator.compare(a.nativeName, b.nativeName));
	if (entries.length <= SINGLE_LIST_MAX) return { layout: 'single', all };

	const suggestedLocales = [
		...new Set(
			[...browser, ...city]
				.map((tag) => supported(tag, locales))
				.filter((locale): locale is string => !!locale)
		)
	];
	const byLocale = new Map(entries.map((entry) => [entry.locale, entry]));
	return {
		layout: 'grouped',
		suggested: suggestedLocales.map((locale) => byLocale.get(locale)!),
		all,
		searchable: entries.length >= SEARCH_MIN
	};
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Search on the native name, the name on screen and the code, ignoring case and accents. */
export function filterLanguages(entries: LanguageEntry[], query: string): LanguageEntry[] {
	const needle = fold(query.trim());
	if (!needle) return entries;
	return entries.filter((entry) =>
		[entry.nativeName, entry.localName, entry.locale].some((text) => fold(text).includes(needle))
	);
}
