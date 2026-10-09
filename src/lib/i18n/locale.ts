/**
 * Locale handling. Texts live in messages/{locale}.json and are compiled by Paraglide into
 * #lib/paraglide/messages.js; this module decides which locale the browser uses.
 *
 * Order: saved choice → browser language → English.
 * - Server (web build): the Paraglide middleware in hooks.server.ts reads the `locale` cookie,
 *   then Accept-Language, and writes the result into <html lang>.
 * - Browser, web build: reuse the server's <html lang>, so hydration never switches language.
 * - Browser, app build (no server): saved choice (localStorage, then cookie) → navigator.languages.
 *
 * We replace Paraglide's own client chain because it saves the detected browser language on the
 * first visit (turning it into a "choice") and calls localStorage without try/catch.
 */
import {
	baseLocale,
	cookieMaxAge,
	cookieName,
	extractLocaleFromNavigator,
	localStorageKey,
	overwriteGetLocale,
	overwriteSetLocale,
	toLocale,
	type Locale
} from '#lib/paraglide/runtime.js';

export {
	getLocale,
	locales,
	localizeHref,
	setLocale,
	type Locale
} from '#lib/paraglide/runtime.js';

/** Each language named in itself: the same in every locale, so it is data, not copy. */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	es: 'Español',
	ca: 'Català'
};

function readStored(): Locale | undefined {
	try {
		return toLocale(localStorage.getItem(localStorageKey));
	} catch {
		return undefined;
	}
}

function readCookie(): Locale | undefined {
	const prefix = `${cookieName}=`;
	const value = document.cookie
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix))
		?.slice(prefix.length);
	return toLocale(value);
}

function detectClientLocale(): Locale {
	const fromServer =
		__BUILD_TARGET__ === 'web' ? toLocale(document.documentElement.lang) : undefined;
	return fromServer ?? readStored() ?? readCookie() ?? extractLocaleFromNavigator() ?? baseLocale;
}

/** Saves the user's choice where both the server (cookie) and the app (localStorage) can read it. */
function saveChoice(locale: Locale) {
	document.cookie = `${cookieName}=${locale}; path=/; max-age=${cookieMaxAge}; samesite=lax`;
	try {
		localStorage.setItem(localStorageKey, locale);
	} catch {
		// Storage blocked: the cookie alone still works on the web.
	}
}

/** Called once from hooks.client.ts, before anything renders. */
export function initClientLocale() {
	const locale = detectClientLocale();
	document.documentElement.lang = locale;
	overwriteGetLocale(() => locale);
	overwriteSetLocale((next) => {
		saveChoice(next);
		if (next !== locale) window.location.reload();
	});
}
