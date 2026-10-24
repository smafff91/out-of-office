import { describe, expect, it } from 'vitest';
import { buildReturnUrl, readReturnParams, safeNextPath } from './next.ts';

describe('safeNextPath', () => {
	it('keeps paths on this site', () => {
		expect(safeNextPath('/barcelona/cafe-tramuntana')).toBe('/barcelona/cafe-tramuntana');
		expect(safeNextPath('/barcelona?q=gracia#list')).toBe('/barcelona?q=gracia#list');
		expect(safeNextPath('/')).toBe('/');
	});

	it('refuses anything that could leave the site', () => {
		for (const raw of [
			'//evil.com',
			'https://evil.com',
			'javascript:alert(1)',
			'/\\evil.com',
			'\\\\evil.com',
			'evil.com',
			'/\u0000x',
			'/\nx',
			'',
			null,
			undefined
		]) {
			expect(safeNextPath(raw)).toBe('/');
		}
	});
});

describe('buildReturnUrl', () => {
	const next = '/barcelona/café-del-racó?from=list&x=a b';
	// The same path, percent-encoded by URL: what the browser would request anyway.
	const encoded = '/barcelona/caf%C3%A9-del-rac%C3%B3?from=list&x=a%20b';

	it('normalizes next to its encoded form', () => {
		expect(safeNextPath(next)).toBe(encoded);
	});

	it('works with and without a query in the base, and drops its fragment', () => {
		const plain = new URL(buildReturnUrl(next, 'http://localhost:5173/auth/callback'));
		expect(plain.pathname).toBe('/auth/callback');
		expect(plain.searchParams.get('next')).toBe(encoded);

		const withQuery = new URL(buildReturnUrl(next, 'https://example.com/auth/callback?app=1#old'));
		expect(withQuery.searchParams.get('app')).toBe('1');
		expect(withQuery.searchParams.get('next')).toBe(encoded);
		expect(withQuery.hash).toBe('');
	});

	it('never carries an unsafe next', () => {
		const url = new URL(buildReturnUrl('//evil.com', 'http://localhost:5173/auth/callback'));
		expect(url.searchParams.get('next')).toBe('/');
	});
});

describe('readReturnParams', () => {
	it('reads back what the email link adds to RedirectTo, with or without a base query', () => {
		for (const base of [
			'http://localhost:5173/auth/callback',
			'https://example.com/auth/callback?app=1'
		]) {
			const redirectTo = buildReturnUrl('/barcelona/cafe?x=1', base);
			// The email template: {{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=email
			const link = `${redirectTo}#token_hash=pkce_abc123&type=email`;
			expect(readReturnParams(link)).toEqual({
				next: '/barcelona/cafe?x=1',
				code: undefined,
				tokenHash: 'pkce_abc123',
				type: 'email',
				error: undefined
			});
		}
	});

	it('reads the Google code and errors', () => {
		const base = buildReturnUrl('/barcelona', 'http://localhost:5173/auth/callback');
		expect(readReturnParams(`${base}&code=xyz`).code).toBe('xyz');
		expect(readReturnParams(`${base}&error=access_denied&error_description=no`).error).toBe(
			'access_denied'
		);
		expect(readReturnParams(`${base}#error=access_denied&error_code=otp_expired`).error).toBe(
			'otp_expired'
		);
	});
});
