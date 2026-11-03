import { describe, expect, it } from 'vitest';
import { toPlaceDetail } from './place-details.ts';

type Row = Parameters<typeof toPlaceDetail>[0];

function row(overrides: Partial<Row>): Row {
	return { id: 'p1', slug: 'cafe', name: 'Café', level: 'certified', ...overrides } as Row;
}

describe('toPlaceDetail', () => {
	it("reads the community's values and the team's, each with its provenance", () => {
		const place = toPlaceDetail(
			row({
				attributes: {
					wifi: { value: 'available', source: 'team', month: '2026-10' },
					outlets: {
						value: 'plenty',
						source: 'users',
						confirmations: 2,
						last_confirmed_on: '2026-10-20'
					}
				},
				laptop_rules: [{ rule: 'no_laptops_weekends', source: 'team', month: '2026-10' }],
				extras: [
					{ extra: 'toilet', source: 'users', confirmations: 1, last_confirmed_on: '2026-10-21' },
					{ extra: 'large_tables', source: 'team', month: '2026-10' }
				]
			})
		);
		expect(place.attributes.wifi).toEqual({ value: 'available', source: 'team', month: '2026-10' });
		expect(place.attributes.outlets).toEqual({
			value: 'plenty',
			source: 'users',
			confirmations: 2,
			lastConfirmedOn: '2026-10-20'
		});
		expect(place.attributes.noise).toBeUndefined();
		expect(place.laptopRules).toEqual([
			{ rule: 'no_laptops_weekends', source: 'team', month: '2026-10' }
		]);
		expect(place.extras).toEqual([
			{ extra: 'toilet', source: 'users', confirmations: 1, lastConfirmedOn: '2026-10-21' },
			{ extra: 'large_tables', source: 'team', month: '2026-10' }
		]);
	});

	it('drops entries without a date or a month', () => {
		const place = toPlaceDetail(
			row({
				attributes: { wifi: { value: 'fast', source: 'team' } },
				laptop_rules: [{ rule: 'no_laptops_lunch', source: 'users', confirmations: 1 }],
				extras: [{ extra: 'toilet' }]
			})
		);
		expect(place.attributes.wifi).toBeUndefined();
		expect(place.laptopRules).toEqual([]);
		expect(place.extras).toEqual([]);
	});
});
