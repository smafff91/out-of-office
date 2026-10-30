import { describe, expect, it } from 'vitest';
import { stash, takeStash } from '#lib/auth/handoff.ts';
import {
	CITY_VIEW_KEY,
	CITY_VIEW_MAX_AGE_MS,
	parseCityView,
	serializeCityView,
	type CityViewState
} from './view-state.ts';

const NOW = 1_800_000_000_000;

const saved = serializeCityView({
	city: 'barcelona',
	savedAt: NOW - 2000,
	camera: { center: [2.1652, 41.3951], zoom: 15.4 },
	snap: 'full',
	sort: 'top',
	certifiedOnly: true,
	pages: 3,
	origin: { kind: 'map', point: [2.165, 41.395] },
	preview: 'cafe-tramuntana',
	listScroll: 640.4,
	panelScroll: 0
});

function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		length: 0,
		clear: () => data.clear(),
		getItem: (key) => data.get(key) ?? null,
		key: () => null,
		removeItem: (key) => void data.delete(key),
		setItem: (key, value) => void data.set(key, value)
	};
}

describe('city view across a reload', () => {
	it('comes back exactly as saved, through the stash', () => {
		const storage = memoryStorage();
		stash(CITY_VIEW_KEY, saved, storage);
		const restored = parseCityView(takeStash(CITY_VIEW_KEY, storage), {
			city: 'barcelona',
			now: NOW
		});
		expect(restored).toEqual({ ...saved, listScroll: 640 });
		// Read once: a later visit starts fresh.
		expect(takeStash(CITY_VIEW_KEY, storage)).toBeUndefined();
	});

	it('keeps the Certified filter switched off where it starts on', () => {
		const off = serializeCityView({ ...saved, certifiedOnly: false });
		expect(parseCityView(off, { city: 'barcelona', now: NOW })?.certifiedOnly).toBe(false);
	});

	it('is ignored for another city, when stale, or from the future', () => {
		expect(parseCityView(saved, { city: 'madrid', now: NOW })).toBeUndefined();
		expect(
			parseCityView(saved, { city: 'barcelona', now: saved.savedAt + CITY_VIEW_MAX_AGE_MS + 1 })
		).toBeUndefined();
		expect(parseCityView(saved, { city: 'barcelona', now: saved.savedAt - 1 })).toBeUndefined();
	});

	it.each<[string, Partial<Record<keyof CityViewState, unknown>>]>([
		['another version', { v: 2 }],
		['an unknown panel position', { snap: 'huge' }],
		['an unknown order', { sort: 'random' }],
		['a non-boolean filter', { certifiedOnly: 'yes' }],
		['no pages', { pages: 0 }],
		['a camera off the globe', { camera: { center: [200, 41.39], zoom: 15 } }],
		['a camera with text', { camera: { center: [2.16, '41'], zoom: 15 } }],
		['an impossible zoom', { camera: { center: [2.16, 41.39], zoom: 40 } }],
		['a broken origin', { origin: { kind: 'user', point: [2] } }],
		['an unsafe preview slug', { preview: '../admin' }]
	])('is ignored with %s', (_, change) => {
		expect(parseCityView({ ...saved, ...change }, { city: 'barcelona', now: NOW })).toBeUndefined();
	});

	it('tolerates missing optional fields and odd scroll values', () => {
		const minimal = { ...saved, camera: undefined, preview: undefined, listScroll: -5 };
		expect(parseCityView(minimal, { city: 'barcelona', now: NOW })).toMatchObject({
			camera: undefined,
			preview: undefined,
			listScroll: 0
		});
		expect(parseCityView(null, { city: 'barcelona', now: NOW })).toBeUndefined();
		expect(parseCityView('x', { city: 'barcelona', now: NOW })).toBeUndefined();
	});
});
