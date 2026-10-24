import { describe, expect, it } from 'vitest';
import { richParts } from './rich.ts';

describe('richParts', () => {
	it('cuts a sentence around its link slots, wherever the translation puts them', () => {
		const en = ({ terms, privacy }: Record<string, string>) =>
			`By continuing you agree to the ${terms} and ${privacy}.`;
		expect(richParts(en, ['terms', 'privacy'])).toEqual([
			{ text: 'By continuing you agree to the ' },
			{ slot: 'terms' },
			{ text: ' and ' },
			{ slot: 'privacy' },
			{ text: '.' }
		]);
		const reordered = ({ terms, privacy }: Record<string, string>) => `${privacy} · ${terms}`;
		expect(richParts(reordered, ['terms', 'privacy'])).toEqual([
			{ slot: 'privacy' },
			{ text: ' · ' },
			{ slot: 'terms' }
		]);
	});
});
