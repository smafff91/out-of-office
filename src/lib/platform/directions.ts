/**
 * Directions to a place in the device's maps app: Apple Maps on Apple devices, Google Maps
 * elsewhere. Only the coordinates are sent (never the place name), so the maps app opens a
 * route, not its own page for the place. In the app this will become a native intent.
 */
import type { LngLat } from '#lib/map/index.ts';

export type MapsProvider = 'apple' | 'google';

/** The maps app for this device; Google on the server and when unsure. */
export function mapsProvider(): MapsProvider {
	if (typeof navigator === 'undefined') return 'google';
	// iPads report themselves as Macs; both have Apple Maps.
	return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? 'apple' : 'google';
}

export function directionsUrl([lng, lat]: LngLat, provider: MapsProvider = mapsProvider()): string {
	const destination = `${lat},${lng}`;
	return provider === 'apple'
		? `https://maps.apple.com/?daddr=${destination}`
		: `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
