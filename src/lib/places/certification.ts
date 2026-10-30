/**
 * The lines next to the certification on the place page:
 * - under the badge: "Picked by our team · Oct 2026" or "Confirmed by 12 users" (same badge,
 *   same pin for both origins);
 * - instead of the level line: "Certification removed in Oct 2026", while the database says so
 *   (place_details.removed_on, for 90 days after a removal).
 */
import { formatMonth } from '#lib/i18n/format.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';
import type { PlaceDetail } from '#lib/supabase/place-details.ts';

type Place = Pick<
	PlaceDetail,
	'level' | 'certOrigin' | 'certifiedOn' | 'contributors' | 'removedOn'
>;

/** The line under the badge, for certified places only. */
export function certificationOrigin(
	place: Place,
	locale: Locale = getLocale()
): string | undefined {
	if (place.level !== 'certified') return undefined;
	if (place.certOrigin === 'picked' && place.certifiedOn) {
		return m.place_cert_picked({ month: formatMonth(place.certifiedOn, locale) }, { locale });
	}
	return m.place_confirmed_by({ count: place.contributors }, { locale });
}

/** "Certification removed in …", for places that lost the badge recently. */
export function certificationRemoved(
	place: Place,
	locale: Locale = getLocale()
): string | undefined {
	if (place.level === 'certified' || !place.removedOn) return undefined;
	return m.place_cert_removed({ month: formatMonth(place.removedOn, locale) }, { locale });
}
