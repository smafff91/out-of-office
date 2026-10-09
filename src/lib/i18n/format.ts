/**
 * Numbers, percentages and dates in the active locale (Intl). Message plurals live in
 * messages/*.json; use these helpers for values shown on their own or passed into a message.
 */
import { getLocale } from '#lib/paraglide/runtime.js';

export function formatNumber(value: number): string {
	return new Intl.NumberFormat(getLocale()).format(value);
}

/** 0.94 → "94%" (en), "94 %" (es, ca). */
export function formatPercent(ratio: number): string {
	return new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(
		ratio
	);
}

/** Freshness of a confirmation: "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago". */
export function formatDaysAgo(days: number): string {
	const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
	if (days < 14) return format.format(-days, 'day');
	if (days < 60) return format.format(-Math.floor(days / 7), 'week');
	if (days < 365) return format.format(-Math.floor(days / 30), 'month');
	return format.format(-Math.floor(days / 365), 'year');
}

/** A calendar date, e.g. "Sep 2026" or "sept 2026"; pass Intl options to change the shape. */
export function formatDate(
	date: Date | string,
	options: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }
): string {
	return new Intl.DateTimeFormat(getLocale(), options).format(new Date(date));
}
