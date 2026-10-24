import { Webhook } from 'standardwebhooks';
import { describe, expect, it, vi } from 'vitest';
import { RESEND_URL, handleSendEmail, type HookPayload, type SendEmailEnv } from './handler.ts';

const SECRET = `v1,whsec_${Buffer.from('a'.repeat(32)).toString('base64')}`;
const OTHER_SECRET = `v1,whsec_${Buffer.from('b'.repeat(32)).toString('base64')}`;
const env: SendEmailEnv = {
	SEND_EMAIL_HOOK_SECRET: SECRET,
	RESEND_API_KEY: 're_test',
	EMAIL_FROM: 'Out of Office <onboarding@resend.dev>'
};

function payload(overrides: Partial<HookPayload['email_data']> = {}, locale = 'es'): HookPayload {
	return {
		user: { email: 'someone@example.com', user_metadata: { locale } },
		email_data: {
			token: '627909',
			token_hash: 'pkce_abc123',
			redirect_to: 'http://localhost:5173/auth/callback?next=%2Fbarcelona&lang=en',
			email_action_type: 'magiclink',
			site_url: 'http://localhost:5173',
			...overrides
		}
	};
}

function signed(
	body: unknown,
	{
		secret = SECRET,
		at = new Date(),
		id = 'msg_1'
	}: { secret?: string; at?: Date; id?: string } = {}
) {
	const text = JSON.stringify(body);
	const signature = new Webhook(secret.replace('v1,whsec_', '')).sign(id, at, text);
	return new Request('https://fn.example/send-email', {
		method: 'POST',
		headers: {
			'webhook-id': id,
			'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
			'webhook-signature': signature
		},
		body: text
	});
}

function resend(status = 200) {
	return vi.fn<typeof fetch>(async () => new Response('{"id":"x"}', { status }));
}

async function run(request: Request, fetchImpl = resend(), config = env) {
	const logs: string[] = [];
	const response = await handleSendEmail(request, config, fetchImpl, (line) => logs.push(line));
	const body = (await response.json()) as { error?: { http_code: number; message: string } };
	return { response, body, fetchImpl, logs };
}

function sentEmail(fetchImpl: ReturnType<typeof resend>) {
	const [url, init] = fetchImpl.mock.calls[0];
	return { url, init: init!, email: JSON.parse(String(init!.body)) };
}

describe('signature', () => {
	it('accepts a request signed with the hook secret', async () => {
		const { response, body } = await run(signed(payload()));
		expect(response.status).toBe(200);
		expect(body).toEqual({});
	});

	it('refuses a wrong secret, a changed body, an old request or missing headers', async () => {
		const wrongSecret = signed(payload(), { secret: OTHER_SECRET });

		const original = signed(payload());
		const changed = new Request(original.url, {
			method: 'POST',
			headers: original.headers,
			body: JSON.stringify(payload({ token: '000000' }))
		});

		const old = signed(payload(), { at: new Date(Date.now() - 10 * 60 * 1000) });

		const unsigned = new Request('https://fn.example/send-email', {
			method: 'POST',
			body: JSON.stringify(payload())
		});

		for (const request of [wrongSecret, changed, old, unsigned]) {
			const { response, body, fetchImpl } = await run(request);
			expect(response.status).toBe(401);
			expect(body.error?.http_code).toBe(401);
			expect(fetchImpl).not.toHaveBeenCalled();
		}
	});

	it('sends nothing without its configuration', async () => {
		for (const missing of ['SEND_EMAIL_HOOK_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM'] as const) {
			const { response, fetchImpl } = await run(signed(payload()), resend(), {
				...env,
				[missing]: undefined
			});
			expect(response.status).toBe(500);
			expect(fetchImpl).not.toHaveBeenCalled();
		}
	});
});

describe('the email', () => {
	it('goes to Resend in the language of the page, with the code and the link', async () => {
		const { fetchImpl } = await run(signed(payload()));
		const { url, init, email } = sentEmail(fetchImpl);
		expect(url).toBe(RESEND_URL);
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer re_test');
		expect(new Headers(init.headers).get('Idempotency-Key')).toBe('msg_1');
		expect(email.from).toBe(env.EMAIL_FROM);
		expect(email.to).toEqual(['someone@example.com']);
		// Page in English, profile in Spanish: English.
		expect(email.subject).toBe('Your sign-in code');
		expect(email.html).toContain('<html lang="en">');
		expect(email.html).toContain('627909');
		const link =
			'http://localhost:5173/auth/callback?next=%2Fbarcelona&lang=en#token_hash=pkce_abc123&type=email';
		expect(email.html).toContain(`href="${link.replace(/&/g, '&amp;')}"`);
		expect(email.text).toContain(link);
		expect(email.text).toContain('627909');
	});

	it('uses the profile language when the page sent none', async () => {
		const { fetchImpl } = await run(
			signed(payload({ redirect_to: 'http://localhost:5173/auth/callback?next=%2F' }, 'ca'))
		);
		const { email } = sentEmail(fetchImpl);
		expect(email.subject).toBe('El teu codi per entrar');
		expect(email.html).toContain('<html lang="ca">');
	});

	it('builds the link from a return URL without a query, or from the site URL', async () => {
		const plain = await run(signed(payload({ redirect_to: 'https://example.com/auth/callback' })));
		expect(sentEmail(plain.fetchImpl).email.text).toContain(
			'https://example.com/auth/callback#token_hash=pkce_abc123&type=email'
		);

		const none = await run(signed(payload({ redirect_to: '' })));
		expect(sentEmail(none.fetchImpl).email.text).toContain(
			'http://localhost:5173#token_hash=pkce_abc123&type=email'
		);
	});

	it('is the same for a returning user and a new one', async () => {
		const returning = await run(signed(payload({ email_action_type: 'magiclink' })));
		const created = await run(signed(payload({ email_action_type: 'signup' })));
		const { email: a } = sentEmail(returning.fetchImpl);
		const { email: b } = sentEmail(created.fetchImpl);
		expect(b).toEqual(a);
	});

	it('names an unhandled email type in the log and sends nothing', async () => {
		const { response, fetchImpl, logs } = await run(
			signed(payload({ email_action_type: 'recovery' }))
		);
		expect(response.status).toBe(500);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(logs).toContain('send-email: unhandled email_action_type: recovery');
	});

	it('escapes the values it puts in the HTML', async () => {
		const { fetchImpl } = await run(
			signed(payload({ redirect_to: 'https://example.com/cb?next=%2F&x="><script>' }))
		);
		const { email } = sentEmail(fetchImpl);
		expect(email.html).not.toContain('"><script>');
		expect(email.html).toContain('&quot;&gt;&lt;script&gt;');
	});
});

describe('when Resend fails', () => {
	it('answers 500 for a refused or failed send, so the client shows send_failed', async () => {
		for (const status of [403, 422, 500]) {
			const { response, body } = await run(signed(payload()), resend(status));
			expect(response.status).toBe(500);
			expect(body).toEqual({ error: { http_code: 500, message: 'The email could not be sent' } });
		}
	});

	it('answers 500 when Resend does not answer in time', async () => {
		const timeout = vi.fn<typeof fetch>(async () => {
			throw new DOMException('The operation timed out.', 'TimeoutError');
		});
		const { response, logs } = await run(signed(payload()), timeout);
		expect(response.status).toBe(500);
		expect(logs).toContain('send-email: magiclink en resend timeout');
	});

	it('never logs the address, the code or the token', async () => {
		const { logs } = await run(signed(payload()), resend(403));
		const all = logs.join('\n');
		for (const secret of ['someone@example.com', '627909', 'pkce_abc123']) {
			expect(all).not.toContain(secret);
		}
	});
});
