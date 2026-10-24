/**
 * The sign-in email: one layout for the Send Email Hook (handler.ts) and for the Go templates
 * kept as a fallback in supabase/templates (scripts/build-email-templates.ts), so the two never
 * drift apart. Plain TypeScript, no Deno or Node APIs: it runs in the Edge Function, in Node
 * scripts and in vitest.
 */

/** The texts of one language, from the email_signin_* messages (copy.gen.ts). */
export type EmailCopy = {
	subject: string;
	title: string;
	codeIntro: string;
	linkIntro: string;
	button: string;
	expiry: string;
	ignore: string;
};

export const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The texts in `copy` are escaped here; `code` and `href` are inserted as they are, so they
 * must already be safe HTML (escaped values, or Go template placeholders).
 */
export function emailBody(copy: EmailCopy, code: string, href: string): string {
	const t = (key: keyof EmailCopy) => escapeHtml(copy[key]);
	return `
		<h1 style="margin: 0 0 16px; font-size: 26px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1">${t('title')}</h1>
		<p style="margin: 0 0 12px; font-size: 15px; line-height: 1.5; color: #6b5d53">${t('codeIntro')}</p>
		<p style="margin: 0 0 24px; font-family: ui-monospace, Menlo, monospace; font-size: 34px; font-weight: 600; letter-spacing: 0.2em">${code}</p>
		<p style="margin: 0 0 12px; font-size: 15px; line-height: 1.5; color: #6b5d53">${t('linkIntro')}</p>
		<p style="margin: 0 0 24px"><a href="${href}" style="display: inline-block; padding: 16px 28px; border-radius: 16px; background: #1f1712; color: #faf7f3; font-size: 16px; font-weight: 700; text-decoration: none">${t('button')}</a></p>
		<p style="margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: #6b5d53">${t('expiry')}</p>
		<p style="margin: 0; font-size: 13px; line-height: 1.5; color: #6b5d53">${t('ignore')}</p>
	`;
}

/** `lang` and `body` are inserted as they are (see emailBody). */
export function emailLayout({ app, lang, body }: { app: string; lang: string; body: string }) {
	return `<!doctype html>
<html lang="${lang}">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin: 0; padding: 32px 20px; background: #faf7f3; color: #1f1712; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif">
	<div style="max-width: 480px; margin: 0 auto; padding: 28px 24px; border-radius: 20px; background: #ffffff">
		<p style="margin: 0 0 20px; font-size: 18px; font-weight: 800; letter-spacing: -0.03em; color: #6b5d53">${escapeHtml(app)}</p>${body}
	</div>
</body>
</html>
`;
}

/** The link in the email: the token goes in the fragment, never to a server or its logs. */
export function signInLink(redirectTo: string, tokenHash: string): string {
	const base = redirectTo.split('#')[0];
	return `${base}#token_hash=${encodeURIComponent(tokenHash)}&type=email`;
}

/** The finished email for one user (Send Email Hook). */
export function renderSignInEmail({
	app,
	lang,
	copy,
	code,
	link
}: {
	app: string;
	lang: string;
	copy: EmailCopy;
	code: string;
	link: string;
}): { subject: string; html: string; text: string } {
	const html = emailLayout({
		app,
		lang: escapeHtml(lang),
		body: emailBody(copy, escapeHtml(code), escapeHtml(link))
	});
	const text = [
		copy.title,
		'',
		copy.codeIntro,
		code,
		'',
		copy.linkIntro,
		link,
		'',
		copy.expiry,
		copy.ignore,
		''
	].join('\n');
	return { subject: copy.subject, html, text };
}
