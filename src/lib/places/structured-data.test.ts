import { describe, expect, it } from 'vitest';
import { jsonLd, placeStructuredData } from './structured-data.ts';

const URL = 'https://example.org/barcelona/cafe-tramuntana';
const base = {
	name: 'Café Tramuntana',
	amenity: 'cafe' as const,
	address: 'Carrer de Verdi, 12',
	point: [2.1561, 41.4036] as [number, number],
	openingHours: 'Mo-Fr 08:00-20:00; Sa 09:00-14:00'
};

describe('placeStructuredData', () => {
	it('describes a café with address, coordinates and hours', () => {
		const data = placeStructuredData(base, URL, 'Barcelona');
		expect(data['@type']).toBe('CafeOrCoffeeShop');
		expect(data.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 41.4036, longitude: 2.1561 });
		expect(data.address).toEqual({
			'@type': 'PostalAddress',
			streetAddress: 'Carrer de Verdi, 12',
			addressLocality: 'Barcelona'
		});
		expect(data.openingHoursSpecification).toHaveLength(6);
		expect(data.openingHoursSpecification?.[5]).toEqual({
			dayOfWeek: 'Saturday',
			opens: '09:00',
			closes: '14:00'
		});
		expect(data).not.toHaveProperty('aggregateRating');
	});

	it('leaves out what is unknown or uncertain', () => {
		const data = placeStructuredData(
			{ ...base, amenity: 'bar', address: null, openingHours: 'Mo-Fr 08:00-20:00; PH off' },
			URL,
			'Barcelona'
		);
		expect(data['@type']).toBe('BarOrPub');
		expect(data.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Barcelona' });
		expect(data).not.toHaveProperty('openingHoursSpecification');
	});
});

describe('jsonLd', () => {
	it('cannot close the script tag', () => {
		expect(jsonLd({ name: '</script><b>' })).not.toContain('</script>');
	});
});
