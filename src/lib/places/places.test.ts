import { describe, expect, it } from 'vitest';
import { distanceMeters, walkingEstimate } from './distance.ts';
import { matchesQuery } from './search.ts';

describe('search', () => {
	it('ignores accents, case and apostrophes', () => {
		expect(matchesQuery('la Vila de Gràcia', 'Gracia')).toBe(true);
		expect(matchesQuery('les Corts', 'corts')).toBe(true);
		expect(matchesQuery('les Corts', 'les corts')).toBe(true);
		expect(matchesQuery('les Corts', 'LES  CÒRTS')).toBe(true);
		expect(matchesQuery("l'Antiga Esquerra de l'Eixample", "l'antiga")).toBe(true);
		expect(matchesQuery("l'Antiga Esquerra de l'Eixample", 'eixample antiga')).toBe(true);
		expect(matchesQuery('Sant Antoni', 'gracia')).toBe(false);
		expect(matchesQuery('Sant Antoni', '   ')).toBe(false);
	});
});

describe('distance', () => {
	it('measures straight-line distance', () => {
		// Plaça de Catalunya → Sagrada Família: about 1.9 km in a straight line.
		const meters = distanceMeters([2.17, 41.387], [2.1744, 41.4036]);
		expect(meters).toBeGreaterThan(1800);
		expect(meters).toBeLessThan(1900);
	});

	it('turns meters into a walking estimate', () => {
		expect(walkingEstimate(10)).toEqual({ kind: 'minutes', minutes: 1 });
		expect(walkingEstimate(185)).toEqual({ kind: 'minutes', minutes: 3 });
		expect(walkingEstimate(5000)).toEqual({ kind: 'km', km: 6.5 });
	});
});

describe('list sections', async () => {
	const { buildSections, firstEntries } = await import('./list.ts');
	const pin = (slug: string, level: 'osm_only' | 'community' | 'certified', lng: number) => ({
		type: 'Feature' as const,
		geometry: { type: 'Point' as const, coordinates: [lng, 41.39] as [number, number] },
		properties: { slug, name: slug, level }
	});
	const places = {
		type: 'FeatureCollection' as const,
		features: [
			pin('far-certified', 'certified', 2.2),
			pin('near-plain', 'osm_only', 2.1701),
			pin('mid-community', 'community', 2.18)
		]
	};
	const origin = { point: [2.17, 41.39] as [number, number], kind: 'user' as const };

	it('sorts by distance and filters certified places', () => {
		const nearest = buildSections(places, { origin, sort: 'nearest', certifiedOnly: false });
		expect(nearest?.[0].entries.map((e) => e.slug)).toEqual([
			'near-plain',
			'mid-community',
			'far-certified'
		]);
		const certified = buildSections(places, { origin, sort: 'nearest', certifiedOnly: true });
		expect(certified?.[0].entries.map((e) => e.slug)).toEqual(['far-certified']);
	});

	it('orders Top rated by ranking, then few votes, then no votes by distance', () => {
		const sections = buildSections(places, {
			origin,
			sort: 'top',
			certifiedOnly: false,
			ranking: [
				{ slug: 'far-certified', votes: 12, wilson: 0.7, section: 'rated' },
				{ slug: 'mid-community', votes: 2, wilson: 0.3, section: 'few_votes' }
			]
		});
		expect(sections?.map((s) => [s.id, s.entries.map((e) => e.slug)])).toEqual([
			['rated', ['far-certified']],
			['few_votes', ['mid-community']],
			['no_votes', ['near-plain']]
		]);
		expect(firstEntries(sections!, 2).map((s) => s.id)).toEqual(['rated', 'few_votes']);
	});
});
