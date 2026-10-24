import { afterEach, describe, expect, it } from 'vitest';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { localizeHref } from './locale.ts';

describe('localizeHref', () => {
	afterEach(() => overwriteGetLocale(() => 'en'));

	it('never adds /es/ or /ca/ while the "url" strategy is off', () => {
		for (const locale of ['en', 'es', 'ca'] as const) {
			overwriteGetLocale(() => locale);
			expect(localizeHref('/barcelona')).toBe('/barcelona');
			expect(localizeHref('/barcelona/onis-coffee?x=1#top')).toBe('/barcelona/onis-coffee?x=1#top');
			expect(localizeHref('/terms', { locale: 'ca' })).toBe('/terms');
		}
	});
});
