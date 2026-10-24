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
 *
 * Changing language (the profile menu, for everyone): the choice is saved, listeners run (the
 * signed-in user's profile is updated), drafts are stashed (#lib/auth/handoff.ts), then the same
 * page reloads. With language URLs (/es/, /ca/) later, only the reload below changes: it will
 * navigate to localizeHref(current page, { locale }) instead; callers keep using setLocale().
 */
import { runBeforeLeave } from '#lib/auth/handoff.ts';
import {
	baseLocale,
	cookieMaxAge,
	localizeHref as paraglideLocalizeHref,
	strategy,
	cookieName,
	extractLocaleFromNavigator,
	localStorageKey,
	overwriteGetLocale,
	overwriteSetLocale,
	toLocale,
	type Locale
} from '#lib/paraglide/runtime.js';

export { getLocale, locales, setLocale, type Locale } from '#lib/paraglide/runtime.js';

/**
 * Internal links. Paraglide's own localizeHref always applies its default URL patterns
 * (/es/…, /ca/…) even when the "url" strategy is off, and those pages do not exist yet. Until
 * the strategy is on, links stay as they are; afterwards Paraglide localizes them.
 */
export function localizeHref(href: string, options?: { locale?: Locale }): string {
	return strategy.includes('url') ? paraglideLocalizeHref(href, options) : href;
}

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

/** When the saved choice was made: the latest explicit choice wins on sign-in (locale-sync.ts). */
const CHOSEN_AT_KEY = 'locale_chosen_at';

/** Saves the user's choice where both the server (cookie) and the app (localStorage) can read it. */
function saveChoice(locale: Locale) {
	document.cookie = `${cookieName}=${locale}; path=/; max-age=${cookieMaxAge}; samesite=lax`;
	try {
		localStorage.setItem(localStorageKey, locale);
		localStorage.setItem(CHOSEN_AT_KEY, String(Date.now()));
	} catch {
		// Storage blocked: the cookie alone still works on the web.
	}
}

/** The choice made on this device, with its time when known. */
export function savedChoice(): { locale: Locale; chosenAt?: number } | undefined {
	const locale = readStored() ?? readCookie();
	if (!locale) return undefined;
	let chosenAt: number | undefined;
	try {
		const raw = Number(localStorage.getItem(CHOSEN_AT_KEY));
		chosenAt = Number.isFinite(raw) && raw > 0 ? raw : undefined;
	} catch {
		chosenAt = undefined;
	}
	return { locale, chosenAt };
}

type LocaleListener = (next: Locale) => Promise<void> | void;
const listeners = new Set<LocaleListener>();
/** Listeners get this long before the page reloads anyway. */
const LISTENER_TIMEOUT_MS = 2500;

/** Runs before the reload that applies a new language. Returns the unsubscribe. */
export function onLocaleChange(listener: LocaleListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

async function notifyListeners(next: Locale) {
	const all = Promise.allSettled([...listeners].map(async (listener) => listener(next)));
	await Promise.race([all, new Promise((resolve) => setTimeout(resolve, LISTENER_TIMEOUT_MS))]);
}

/** Called once from hooks.client.ts, before anything renders. */
export function initClientLocale() {
	const locale = detectClientLocale();
	document.documentElement.lang = locale;
	overwriteGetLocale(() => locale);
	overwriteSetLocale((next) => {
		saveChoice(next);
		if (next === locale) return;
		void notifyListeners(next).finally(() => {
			runBeforeLeave();
			window.location.reload();
		});
	});
}
