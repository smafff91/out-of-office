import type { Bounds, LngLat } from './types.ts';

export function isInside([lng, lat]: LngLat, [west, south, east, north]: Bounds): boolean {
	return lng >= west && lng <= east && lat >= south && lat <= north;
}
