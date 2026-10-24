import { describe, expect, it, vi } from 'vitest';
import { onBeforeLeave, runBeforeLeave, stash, takeStash } from './handoff.ts';

function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (key) => data.get(key) ?? null,
		key: (i) => [...data.keys()][i] ?? null,
		removeItem: (key) => void data.delete(key),
		setItem: (key, value) => void data.set(key, value)
	};
}

const blocked = new Proxy({} as Storage, {
	get() {
		throw new DOMException('denied', 'SecurityError');
	}
});

describe('stash', () => {
	it('gives a value back once', () => {
		const storage = memoryStorage();
		stash('contribution:cafe', { wifi: 'fast' }, storage);
		expect(takeStash('contribution:cafe', storage)).toEqual({ wifi: 'fast' });
		expect(takeStash('contribution:cafe', storage)).toBeUndefined();
	});

	it('survives blocked or missing storage', () => {
		expect(() => stash('x', 1, blocked)).not.toThrow();
		expect(takeStash('x', blocked)).toBeUndefined();
		expect(takeStash('x', undefined)).toBeUndefined();
	});
});

describe('onBeforeLeave', () => {
	it('runs every listener, even after one fails, until unsubscribed', () => {
		const good = vi.fn();
		const offBad = onBeforeLeave(() => {
			throw new Error('boom');
		});
		const offGood = onBeforeLeave(good);
		runBeforeLeave();
		expect(good).toHaveBeenCalledTimes(1);
		offBad();
		offGood();
		runBeforeLeave();
		expect(good).toHaveBeenCalledTimes(1);
	});
});
