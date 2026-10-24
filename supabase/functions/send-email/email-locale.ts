/**
 * The language of a sign-in email: the page the code was asked from wins, because that is the
 * language the user is reading. The client puts it in the return URL (`lang`, see
 * src/lib/auth/next.ts); then the profile language (user metadata, kept in step with
 * profiles.locale); then English.
 */

export const FALLBACK_LOCALE = 'en';

/** `es`, `ES`, `es-ES` and `es_ES` all give `es` when `es` is available. */
function match(raw: unknown, locales: readonly string[]): string | undefined {
	if (typeof raw !== 'string') return undefined;
	const tag = raw.trim().toLowerCase().replace(/_/g, '-');
	if (!tag) return undefined;
	return locales.find((locale) => locale === tag) ?? locales.find((l) => l === tag.split('-')[0]);
}

/** `lang` from the return URL; also for an app scheme (`outofoffice://auth/callback?lang=ca`). */
function langParam(redirectTo: string | undefined): string | undefined {
	if (!redirectTo) return undefined;
	try {
		return new URL(redirectTo).searchParams.get('lang') ?? undefined;
	} catch {
		return undefined;
	}
}

export function pickEmailLocale({
	redirectTo,
	metadataLocale,
	locales
}: {
	redirectTo?: string;
	metadataLocale?: unknown;
	locales: readonly string[];
}): string {
	return match(langParam(redirectTo), locales) ?? match(metadataLocale, locales) ?? FALLBACK_LOCALE;
}
