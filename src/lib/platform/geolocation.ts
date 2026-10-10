/**
 * Device location. Today the browser Geolocation API; in the app, the Capacitor plugin with the
 * same interface. Positions stay in memory only: never saved, never sent anywhere by this module.
 */

export type Position = { lat: number; lng: number; accuracy: number };

export type PositionResult =
	| { ok: true; position: Position }
	| { ok: false; reason: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

/** 'granted' only when the browser says so explicitly; anything uncertain is 'unknown'. */
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

const TIMEOUT_MS = 10_000;
/** A position this recent is reused instead of asking the device again. */
const MAX_AGE_MS = 60_000;

let lastPosition: Position | undefined;

/** The last position read in this session, if any (memory only). */
export function getLastPosition(): Position | undefined {
	return lastPosition;
}

/** Asks for the current position; may show the system permission prompt. */
export function requestPosition(): Promise<PositionResult> {
	if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
		return Promise.resolve({ ok: false, reason: 'unsupported' });
	}
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				lastPosition = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
				resolve({ ok: true, position: lastPosition });
			},
			(error) => {
				const reason =
					error.code === error.PERMISSION_DENIED
						? 'denied'
						: error.code === error.TIMEOUT
							? 'timeout'
							: 'unavailable';
				resolve({ ok: false, reason });
			},
			{ enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS }
		);
	});
}

/** Reads the permission state without prompting. Missing or failing Permissions API → 'unknown'. */
export async function getPermissionStatus(): Promise<PermissionStatus> {
	try {
		if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';
		const { state } = await navigator.permissions.query({ name: 'geolocation' });
		return state === 'granted' || state === 'denied' || state === 'prompt' ? state : 'unknown';
	} catch {
		return 'unknown';
	}
}

/**
 * The position only if permission is already granted (explicitly): never shows a prompt.
 * Used where the user has not asked for their location (city map, place pages).
 */
export async function getPositionIfGranted(): Promise<Position | undefined> {
	if (lastPosition) return lastPosition;
	if ((await getPermissionStatus()) !== 'granted') return undefined;
	const result = await requestPosition();
	return result.ok ? result.position : undefined;
}
