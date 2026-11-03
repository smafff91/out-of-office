import { describe, expect, it } from 'vitest';
import {
	parsePicksFile,
	planPicks,
	runPicks,
	summarize,
	teamInfoPayload,
	type PickClient,
	type PickFileRow,
	type PicksFile
} from './pick-file.ts';

const TEAM: PickFileRow['team'] = {
	wifi: 'available',
	outlets: 'plenty',
	noise: null,
	long_stays: 'welcome',
	laptop_rules: ['weekends'],
	extras: ['large_tables'],
	note: 'Work area upstairs.'
};

function row(name: string, slug?: string, team: Partial<PickFileRow['team']> = {}): PickFileRow {
	return {
		name,
		address: 'Carrer de Casp, 70',
		district: 'Eixample',
		sources_note: 'Blog A 2026, Blog B 2025',
		...(slug && { slug }),
		team: { ...TEAM, ...team }
	};
}

function picksFile(places: PickFileRow[]): PicksFile {
	return { city: 'barcelona', picked_month: '2026-10', places };
}

type Place = Awaited<ReturnType<PickClient['place']>>;

/** A database in memory that records every write. */
function fakeClient(places: Record<string, NonNullable<Place>>) {
	const writes: string[] = [];
	const client: PickClient = {
		async cityId(slug) {
			return slug === 'barcelona' ? 'city-1' : undefined;
		},
		async place(_city, slug) {
			return places[slug];
		},
		async pick(placeId, note, pickedOn) {
			writes.push(`pick ${placeId} ${pickedOn} ${note}`);
			return { origin: 'picked' };
		},
		async setTeamInfo(placeId, info, month) {
			writes.push(`team ${placeId} ${month} ${JSON.stringify(info)}`);
			return placeId === 'p-certified' ? 'unchanged' : 'created';
		}
	};
	return { client, writes };
}

const PLACES = {
	saga: { id: 'p-saga', level: 'osm_only', origin: null, missingFromOsm: false },
	'alsur-cafe': { id: 'p-certified', level: 'certified', origin: 'picked', missingFromOsm: false },
	'mono-cafe': { id: 'p-confirmed', level: 'certified', origin: 'confirmed', missingFromOsm: false }
} as const satisfies Record<string, NonNullable<Place>>;

describe('--pick-file', () => {
	it('skips a row without a slug: no call at all', async () => {
		const { client, writes } = fakeClient(PLACES);
		const file = picksFile([row('Sopa'), row('SAGA Coffee Stories', 'saga')]);
		const plan = await planPicks(file, client);
		expect(plan.map((p) => p.action)).toEqual(['no_slug', 'pick']);

		const results = await runPicks(file, plan, client, { dryRun: false });
		expect(results[0]).toMatchObject({ line: 1, outcome: 'skipped', detail: 'no slug' });
		expect(writes).toEqual([
			'pick p-saga 2026-10-01 Blog A 2026, Blog B 2025',
			'team p-saga 2026-10-01 {"wifi":"available","outlets":"plenty","long_stays":"welcome","laptop_rules":["no_laptops_weekends"],"extras":["large_tables"],"note":"Work area upstairs."}'
		]);
		expect(summarize(results)).toMatchObject({ picked: 1, skipped: 1, errors: 0, teamCreated: 1 });
	});

	it('does not pick an already certified place, and only saves its team info', async () => {
		const { client, writes } = fakeClient(PLACES);
		const file = picksFile([row('Alsur Café', 'alsur-cafe'), row('Mono Café', 'mono-cafe')]);
		const plan = await planPicks(file, client);
		expect(plan.map((p) => [p.action, p.origin])).toEqual([
			['team_info', 'picked'],
			['team_info', 'confirmed']
		]);

		const results = await runPicks(file, plan, client, { dryRun: false });
		expect(writes.filter((w) => w.startsWith('pick'))).toEqual([]);
		expect(writes).toHaveLength(2);
		expect(results.map((r) => [r.outcome, r.teamInfo])).toEqual([
			['already_certified', 'unchanged'],
			['already_certified', 'created']
		]);
		expect(summarize(results)).toMatchObject({ picked: 0, alreadyCertified: 2, teamUnchanged: 1 });
	});

	it('writes nothing in a dry run', async () => {
		const { client, writes } = fakeClient(PLACES);
		const file = picksFile([
			row('SAGA Coffee Stories', 'saga'),
			row('Alsur Café', 'alsur-cafe'),
			row('Sopa')
		]);
		const plan = await planPicks(file, client);
		const results = await runPicks(file, plan, client, { dryRun: true });
		expect(writes).toEqual([]);
		expect(summarize(results)).toMatchObject({ picked: 1, alreadyCertified: 1, skipped: 1 });
	});

	it('reports a slug that does not exist and goes on with the other rows', async () => {
		const { client, writes } = fakeClient(PLACES);
		const file = picksFile([row('Ghost', 'ghost'), row('SAGA Coffee Stories', 'saga')]);
		const results = await runPicks(file, await planPicks(file, client), client, { dryRun: false });
		expect(results[0]).toMatchObject({ outcome: 'error', detail: 'slug not found' });
		expect(results[1]).toMatchObject({ outcome: 'picked' });
		expect(writes).toHaveLength(2);
	});

	it('goes on after a database error on one row', async () => {
		const { client, writes } = fakeClient(PLACES);
		client.pick = async (placeId) => {
			if (placeId === 'p-saga') throw new Error('Not picked: it would lose the badge at once.');
			return { origin: 'picked' };
		};
		const file = picksFile([row('SAGA Coffee Stories', 'saga'), row('Alsur Café', 'alsur-cafe')]);
		const results = await runPicks(file, await planPicks(file, client), client, { dryRun: false });
		expect(results[0]).toMatchObject({ outcome: 'error' });
		expect(results[1]).toMatchObject({ outcome: 'already_certified', teamInfo: 'unchanged' });
		expect(writes).toEqual([expect.stringMatching(/^team p-certified/)]);
	});
});

describe('parsePicksFile', () => {
	it('accepts the file format, with unknown values as null or empty lists', () => {
		const file = picksFile([row('SAGA Coffee Stories', 'saga', { wifi: null, laptop_rules: [] })]);
		expect(parsePicksFile(file)).toEqual({ file, problems: [] });
	});

	it('refuses values outside the lists, long notes, duplicate slugs and a bad month', () => {
		const { file, problems } = parsePicksFile({
			city: 'barcelona',
			picked_month: '2026-13',
			places: [
				row('A', 'saga', { wifi: 'none' as never }),
				row('B', 'saga', { laptop_rules: ['time_limit' as never] }),
				row('C', undefined, { note: 'x'.repeat(141) })
			]
		});
		expect(file).toBeUndefined();
		expect(problems).toEqual([
			'"picked_month": "YYYY-MM".',
			'Row 1 (A): team.wifi "none" is not one of fast, slow, available.',
			'Row 2 (B): slug saga already on row 1.',
			'Row 2 (B): team.laptop_rules takes only lunch, weekends.',
			'Row 3 (C): team.note is longer than 140 characters.'
		]);
	});
});

describe('teamInfoPayload', () => {
	it('leaves out what is not known and names the rules as the database does', () => {
		expect(
			teamInfoPayload({
				wifi: 'fast',
				outlets: null,
				noise: null,
				long_stays: null,
				laptop_rules: ['lunch', 'weekends'],
				extras: [],
				note: '  '
			})
		).toEqual({ wifi: 'fast', laptop_rules: ['no_laptops_lunch', 'no_laptops_weekends'] });
	});
});
