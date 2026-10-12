import type { LngLat } from '#lib/map/index.ts';

const EARTH_RADIUS_M = 6_371_000;
/** Streets are not straight lines: walking distance ≈ straight distance × 1.3. */
const WALK_DETOUR = 1.3;
const WALK_METERS_PER_MINUTE = 80;
/** Up to this many minutes we say "12 min walk"; beyond, kilometers. */
export const MAX_WALK_MINUTES = 30;

/** Straight-line distance in meters (haversine). */
export function distanceMeters([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLng = (lng2 - lng1) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Walking estimate: minutes (at least 1) when short enough, otherwise kilometers. */
export function walkingEstimate(
	meters: number
): { kind: 'minutes'; minutes: number } | { kind: 'km'; km: number } {
	const walked = meters * WALK_DETOUR;
	const minutes = Math.max(1, Math.round(walked / WALK_METERS_PER_MINUTE));
	return minutes <= MAX_WALK_MINUTES
		? { kind: 'minutes', minutes }
		: { kind: 'km', km: walked / 1000 };
}
