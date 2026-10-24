/**
 * Where sign-in returns. Google and the email link both go to PUBLIC_AUTH_REDIRECT_URL (the
 * /auth/callback page) with `?next=<page the user was on>`; the callback then opens `next`.
 * The base URL comes from configuration only, so the app build can use a universal link.
 */

const FALLBACK = '/';

/**
 * Accepts only a path on this site ("/barcelona/cafe?x=1#y"). Anything that could leave it
 * ("//evil.com", "https://…", "/\evil.com", control characters) falls back to "/".
 */
export function safeNextPath(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return FALLBACK;
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(raw)) return FALLBACK;
	try {
		// Resolving against a throwaway origin must not change the origin.
		const url = new URL(raw, 'https://same.invalid');
		if (url.origin !== 'https://same.invalid') return FALLBACK;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return FALLBACK;
	}
}

/**
 * The URL sign-in returns to: `base` (keeping any query it already has) plus `next`, without a
 * fragment, because the email link appends `#token_hash=…&type=email` to it.
 * `lang` (email only) is the language of the page: the Send Email Hook writes the email in it
 * (supabase/functions/send-email). The callback page ignores it.
 */
export function buildReturnUrl(next: string, base: string, lang?: string): string {
	const url = new URL(base);
	url.hash = '';
	url.searchParams.set('next', safeNextPath(next));
	if (lang) url.searchParams.set('lang', lang);
	return url.toString();
}

/** What the callback page finds in its URL. */
export type ReturnParams = {
	next: string;
	/** Google (PKCE): exchanged for a session. */
	code?: string;
	/** Email link: verified with verifyOtp. */
	tokenHash?: string;
	type?: string;
	/** Google or Supabase refused, or the user canceled ("access_denied"). */
	error?: string;
};

export function readReturnParams(href: string): ReturnParams {
	const url = new URL(href);
	const fragment = new URLSearchParams(url.hash.slice(1));
	const pick = (name: string) => url.searchParams.get(name) ?? fragment.get(name) ?? undefined;
	return {
		next: safeNextPath(url.searchParams.get('next')),
		code: url.searchParams.get('code') ?? undefined,
		tokenHash: fragment.get('token_hash') ?? undefined,
		type: fragment.get('type') ?? undefined,
		error: pick('error_code') ?? pick('error')
	};
}
