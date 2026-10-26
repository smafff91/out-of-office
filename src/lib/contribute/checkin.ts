/**
 * What the location box of the form says (LatteContribute). Only a preview for the user: the
 * database decides whether the check-in is verified, from a fresh position read on sending.
 */
import type { LngLat } from '#lib/map/types.ts';
import { distanceMeters } from '#lib/places/distance.ts';
import type { PositionResult } from '#lib/platform/geolocation.ts';

export type CheckinView =
	/** Not asked yet ("Add your experience"): "I'm here now". */
	| { state: 'idle' }
	| { state: 'locating' }
	| { state: 'here'; meters: number }
	| { state: 'far'; meters: number }
	/** Near enough, but the device is unsure of the position. */
	| { state: 'imprecise' }
	/** Denied, unavailable, timed out or unsupported. */
	| { state: 'unavailable' };

export function checkinView(
	result: PositionResult,
	place: LngLat,
	{ radiusM, maxAccuracyM }: { radiusM: number; maxAccuracyM: number }
): CheckinView {
	if (!result.ok) return { state: 'unavailable' };
	const { lat, lng, accuracy } = result.position;
	const meters = Math.round(distanceMeters([lng, lat], place));
	if (meters > radiusM) return { state: 'far', meters };
	if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > maxAccuracyM) {
		return { state: 'imprecise' };
	}
	return { state: 'here', meters };
}
