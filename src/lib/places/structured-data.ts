/**
 * schema.org data for the place page (JSON-LD), from public place data only: name, address,
 * coordinates and opening hours when read with certainty. No ratings for now.
 */
import type { PlaceDetail } from '#lib/supabase/place-details.ts';
import { weekSchedule } from './opening-hours.ts';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Place = Pick<PlaceDetail, 'name' | 'amenity' | 'address' | 'point' | 'openingHours'>;

export function placeStructuredData(place: Place, url: string, city: string) {
	const [lng, lat] = place.point;
	const week = weekSchedule(place.openingHours);
	return {
		'@context': 'https://schema.org',
		'@type': place.amenity === 'bar' ? 'BarOrPub' : 'CafeOrCoffeeShop',
		name: place.name,
		url,
		geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng },
		address: {
			'@type': 'PostalAddress',
			...(place.address ? { streetAddress: place.address } : {}),
			addressLocality: city
		},
		...(week
			? {
					openingHoursSpecification: week.flatMap((day) =>
						day.allDay
							? [{ dayOfWeek: DAYS[day.day], opens: '00:00', closes: '23:59' }]
							: day.intervals.map(([opens, closes]) => ({
									dayOfWeek: DAYS[day.day],
									opens,
									closes
								}))
					)
				}
			: {})
	};
}

/** JSON for a <script type="application/ld+json">: "<" escaped so a name cannot close the tag. */
export function jsonLd(data: unknown): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}
