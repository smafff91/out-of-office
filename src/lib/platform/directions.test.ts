import { describe, expect, it } from 'vitest';
import { directionsUrl } from './directions.ts';

describe('directionsUrl', () => {
	it('sends only the coordinates, latitude first', () => {
		expect(directionsUrl([2.1634, 41.3947], 'apple')).toBe(
			'https://maps.apple.com/?daddr=41.3947,2.1634'
		);
		expect(directionsUrl([2.1634, 41.3947], 'google')).toBe(
			'https://www.google.com/maps/dir/?api=1&destination=41.3947,2.1634'
		);
	});
});
