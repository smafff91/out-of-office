/**
 * The city screen as the user left it, kept across the reload that applies a new language:
 * map area, list panel, ordering and filter, the place in the preview, scroll positions.
 * Saved with stash() (sessionStorage, this tab only) from onBeforeLeave in the city layout and
 * read once on the next load. Anything stale, from another city or malformed is ignored, and
 * the screen opens as usual.
 */
import type { LngLat } from '#lib/map/types.ts';
import type { Origin, Sort } from './list.ts';

export const CITY_VIEW_KEY = 'city-view';
/** Older than this, the saved screen is not restored (a reload is a matter of seconds). */
export const CITY_VIEW_MAX_AGE_MS = 5 * 60 * 1000;

export type CityViewState = {
	v: 1;
	city: string;
	savedAt: number;
	/** Map center and zoom, exactly as they were. */
	camera?: { center: LngLat; zoom: number };
	snap: 'closed' | 'half' | 'full';
	sort: Sort;
	certifiedOnly: boolean;
	/** Pages of rows shown ("Show more"). */
	pages: number;
	origin: Origin;
	/** Place open in the tap preview (phones). */
	preview?: string;
	listScroll: number;
	panelScroll: number;
};

const SNAPS = new Set(['closed', 'half', 'full']);
const SORTS = new Set(['nearest', 'top']);
const ORIGINS = new Set(['user', 'area', 'center', 'map']);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);
const isPoint = (value: unknown): value is LngLat =>
	Array.isArray(value) && value.length === 2 && value.every(isNumber);
const isCamera = (value: unknown): value is { center: LngLat; zoom: number } => {
	const camera = value as Record<string, unknown> | null;
	return (
		!!camera &&
		typeof camera === 'object' &&
		isPoint(camera.center) &&
		Math.abs(camera.center[0]) <= 180 &&
		Math.abs(camera.center[1]) <= 90 &&
		isNumber(camera.zoom) &&
		camera.zoom >= 0 &&
		camera.zoom <= 24
	);
};
const scroll = (value: unknown) => (isNumber(value) && value > 0 ? Math.round(value) : 0);

export function serializeCityView(state: Omit<CityViewState, 'v'>): CityViewState {
	return { v: 1, ...state };
}

export function parseCityView(
	raw: unknown,
	{ city, now = Date.now() }: { city: string; now?: number }
): CityViewState | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const s = raw as Record<string, unknown>;
	if (s.v !== 1 || s.city !== city) return undefined;
	if (!isNumber(s.savedAt) || now - s.savedAt > CITY_VIEW_MAX_AGE_MS || s.savedAt > now) {
		return undefined;
	}
	const origin = s.origin as Record<string, unknown> | undefined;
	if (
		!SNAPS.has(s.snap as string) ||
		!SORTS.has(s.sort as string) ||
		typeof s.certifiedOnly !== 'boolean' ||
		!isNumber(s.pages) ||
		s.pages < 1 ||
		!origin ||
		!ORIGINS.has(origin.kind as string) ||
		!isPoint(origin.point)
	) {
		return undefined;
	}
	if (s.camera !== undefined && !isCamera(s.camera)) return undefined;
	if (s.preview !== undefined && (typeof s.preview !== 'string' || !SLUG.test(s.preview))) {
		return undefined;
	}
	return {
		v: 1,
		city,
		savedAt: s.savedAt,
		camera: s.camera as CityViewState['camera'],
		snap: s.snap as CityViewState['snap'],
		sort: s.sort as Sort,
		certifiedOnly: s.certifiedOnly,
		pages: Math.min(Math.floor(s.pages), 50),
		origin: { kind: origin.kind as Origin['kind'], point: origin.point as LngLat },
		preview: s.preview as string | undefined,
		listScroll: scroll(s.listScroll),
		panelScroll: scroll(s.panelScroll)
	};
}
