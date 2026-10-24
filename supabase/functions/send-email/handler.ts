/**
 * Supabase Auth Send Email Hook: Auth creates the code and the token as usual, then calls this
 * function instead of sending the email itself; the email goes out through the Resend API in
 * the language of the page the code was asked from (email-locale.ts).
 *
 * - The request is signed (Standard Webhooks, secret `v1,whsec_…` shared with
 *   [auth.hook.send_email] in supabase/config.toml): anything unsigned gets 401.
 * - Errors answer `{ error: { http_code, message } }` with 500: Auth passes the failure on to
 *   the client, where it shows as send_failed (src/lib/auth/errors.ts).
 * - Logs name the email type, the language and the Resend status: never the address, the code
 *   or the token.
 *
 * No Deno APIs here (index.ts reads the environment), so vitest covers all of it.
 */
import { Webhook } from 'standardwebhooks';
import { EMAIL_APP_NAME, EMAIL_COPY, EMAIL_LOCALES } from './copy.gen.ts';
import { pickEmailLocale } from './email-locale.ts';
import { renderSignInEmail, signInLink } from './render.ts';

export type SendEmailEnv = {
	/** `v1,whsec_<base64>`, the same value as in .env for `supabase config push`. */
	SEND_EMAIL_HOOK_SECRET?: string;
	RESEND_API_KEY?: string;
	/** `Out of Office <onboarding@resend.dev>` in development, an address on the domain later. */
	EMAIL_FROM?: string;
};

type Log = (message: string) => void;

export type HookPayload = {
	user: { email?: string; user_metadata?: Record<string, unknown> };
	email_data: {
		token: string;
		token_hash: string;
		redirect_to?: string;
		email_action_type: string;
		site_url?: string;
	};
};

export const RESEND_URL = 'https://api.resend.com/emails';
/** Auth gives the hook 5 seconds in all. */
export const RESEND_TIMEOUT_MS = 3500;

/**
 * Sign-in code for a returning user (magiclink) and for a new one, with confirmations on
 * (signup): the same email. Anything else is not something the app asks for.
 */
const SIGN_IN_TYPES = new Set(['magiclink', 'signup']);

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const failure = (status: number, message: string) =>
	json(status, { error: { http_code: status, message } });

function verify(secret: string, body: string, headers: Headers): HookPayload | undefined {
	try {
		const webhook = new Webhook(secret.replace(/^v1,whsec_/, ''));
		return webhook.verify(body, {
			'webhook-id': headers.get('webhook-id') ?? '',
			'webhook-timestamp': headers.get('webhook-timestamp') ?? '',
			'webhook-signature': headers.get('webhook-signature') ?? ''
		}) as HookPayload;
	} catch {
		return undefined;
	}
}

export async function handleSendEmail(
	request: Request,
	env: SendEmailEnv,
	fetchImpl: typeof fetch = fetch,
	log: Log = console.log
): Promise<Response> {
	if (request.method !== 'POST') return failure(405, 'Method not allowed');
	const { SEND_EMAIL_HOOK_SECRET: secret, RESEND_API_KEY: apiKey, EMAIL_FROM: from } = env;
	if (!secret || !apiKey || !from) {
		log('send-email: missing configuration');
		return failure(500, 'Email sending is not configured');
	}

	const body = await request.text();
	const payload = verify(secret, body, request.headers);
	if (!payload) {
		log('send-email: invalid signature');
		return failure(401, 'Invalid signature');
	}

	const { user, email_data: data } = payload;
	const type = data?.email_action_type;
	if (!SIGN_IN_TYPES.has(type)) {
		// Named in the log so a new type shows up at once; no personal data.
		log(`send-email: unhandled email_action_type: ${String(type).slice(0, 40)}`);
		return failure(500, 'Unsupported email type');
	}
	if (!user?.email || !data.token || !data.token_hash) {
		log(`send-email: incomplete payload (${type})`);
		return failure(500, 'Incomplete email data');
	}

	const lang = pickEmailLocale({
		redirectTo: data.redirect_to,
		metadataLocale: user.user_metadata?.locale,
		locales: EMAIL_LOCALES
	});
	const redirectTo = data.redirect_to || data.site_url || '';
	const email = renderSignInEmail({
		app: EMAIL_APP_NAME,
		lang,
		copy: EMAIL_COPY[lang as keyof typeof EMAIL_COPY],
		code: data.token,
		link: signInLink(redirectTo, data.token_hash)
	});

	let status: number;
	try {
		const response = await fetchImpl(RESEND_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				// Auth may retry the hook: the same webhook id never sends a second email.
				'Idempotency-Key': request.headers.get('webhook-id') ?? ''
			},
			body: JSON.stringify({ from, to: [user.email], ...email }),
			signal: AbortSignal.timeout(RESEND_TIMEOUT_MS)
		});
		status = response.status;
	} catch (error) {
		const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
		log(`send-email: ${type} ${lang} resend ${reason}`);
		return failure(500, 'The email could not be sent');
	}

	log(`send-email: ${type} ${lang} resend ${status}`);
	if (status < 200 || status >= 300) return failure(500, 'The email could not be sent');
	return json(200, {});
}
