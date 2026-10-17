/**
 * Texts for place data shared by the list, the preview and the place page.
 */
import { formatKilometers, formatTime } from '#lib/i18n/format.ts';
import * as m from '#lib/paraglide/messages.js';
import { walkingEstimate } from '#lib/places/distance.ts';
import { openingStatus } from '#lib/places/opening-hours.ts';
import type { LongStays } from '#lib/supabase/place-details.ts';
import type { LaptopRule, Noise, Outlets, Wifi } from '#lib/supabase/places.ts';

type Label = () => string;

type AttributeLabels = {
	wifi: Record<Wifi, Label>;
	outlets: Record<Outlets, Label>;
	noise: Record<Noise, Label>;
	long_stays: Record<LongStays, Label>;
};

/** Long forms, on their own: "Fast Wi‑Fi", "Plenty of outlets", "Quiet", "Long stays welcome". */
export const ATTRIBUTE_PILLS: AttributeLabels = {
	wifi: {
		none: m.attribute_wifi_none,
		slow: m.attribute_wifi_slow,
		fast: m.attribute_wifi_fast
	},
	outlets: {
		none: m.attribute_outlets_none,
		a_few: m.attribute_outlets_a_few,
		plenty: m.attribute_outlets_plenty
	},
	noise: {
		quiet: m.attribute_noise_quiet,
		noisy: m.attribute_noise_noisy
	},
	long_stays: {
		welcome: m.attribute_long_stays_welcome,
		not_really: m.attribute_long_stays_not_really
	}
};

/** Short forms, under the attribute name in a tile: "Wi‑Fi / Fast". */
export const ATTRIBUTE_VALUES: AttributeLabels = {
	wifi: {
		none: m.attribute_short_wifi_none,
		slow: m.attribute_short_wifi_slow,
		fast: m.attribute_short_wifi_fast
	},
	outlets: {
		none: m.attribute_short_outlets_none,
		a_few: m.attribute_short_outlets_a_few,
		plenty: m.attribute_short_outlets_plenty
	},
	noise: {
		quiet: m.attribute_short_noise_quiet,
		noisy: m.attribute_short_noise_noisy
	},
	long_stays: {
		welcome: m.attribute_short_long_stays_welcome,
		not_really: m.attribute_short_long_stays_not_really
	}
};

export const ATTRIBUTE_NAMES: Record<keyof AttributeLabels, Label> = {
	wifi: m.place_attribute_wifi,
	outlets: m.place_attribute_outlets,
	noise: m.place_attribute_noise,
	long_stays: m.place_attribute_long_stays
};

export const LAPTOP_RULES: Record<LaptopRule, Label> = {
	no_laptops_lunch: m.laptop_rule_no_laptops_lunch,
	no_laptops_weekends: m.laptop_rule_no_laptops_weekends,
	time_limit: m.laptop_rule_time_limit
};

/** "Open until 8:00 PM", "Opens 8:00 AM"…; undefined when the hours are unknown or uncertain. */
export function openingLabel(openingHours: string | null, timezone: string): string | undefined {
	const status = openingStatus(openingHours, timezone);
	if (!status) return undefined;
	if (status.state === 'open') return m.place_open_until({ time: formatTime(status.until) });
	if (status.state === 'opens') return m.place_opens_at({ time: formatTime(status.at) });
	if (status.state === 'open_24h') return m.place_open_24h();
	return m.place_closed_today();
}

/** "7 min walk" or "2.4 km". */
export function distanceLabel(meters: number): string {
	const estimate = walkingEstimate(meters);
	return estimate.kind === 'minutes'
		? m.place_walk_time({ minutes: estimate.minutes })
		: formatKilometers(estimate.km);
}

/** What OSM says about Wi‑Fi (internet_access), shown as "unconfirmed". */
export function osmWifi(tag: string | null): 'yes' | 'no' | undefined {
	if (!tag) return undefined;
	if (tag === 'no') return 'no';
	return ['wlan', 'yes', 'free', 'customers'].includes(tag) ? 'yes' : undefined;
}
