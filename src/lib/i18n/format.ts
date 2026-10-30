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

/**
 * A month from a "YYYY-MM-DD" date: "Oct 2026" (en), "oct 2026" (es, ca). Read as UTC, so the
 * device's timezone never moves it to the previous month.
 */
export function formatMonth(date: string, locale: string = getLocale()): string {
	return new Intl.DateTimeFormat(locale, {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(date));
}

/**
 * A time of day from "HH:MM" (opening hours): "8:00 PM" in English, "20:00" in Spanish and
 * Catalan. Built on a fixed UTC date so the device's timezone never shifts it.
 */
export function formatTime(hhmm: string): string {
	const [hours, minutes] = hhmm.split(':').map(Number);
	return new Intl.DateTimeFormat(getLocale(), {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

/** A distance in kilometers: "2.4 km" (en), "2,4 km" (es, ca). */
export function formatKilometers(km: number): string {
	return new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'kilometer',
		maximumFractionDigits: 1
	}).format(km);
}

/** A short distance in meters: "35 m". */
export function formatMeters(meters: number): string {
	return new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'meter',
		maximumFractionDigits: 0
	}).format(meters);
}

/** A duration in whole hours: "2h" (en), "2 h" (es, ca). */
export function formatHours(hours: number): string {
	return new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'hour',
		unitDisplay: 'narrow'
	}).format(hours);
}

/** Short weekday name, Monday = 0: "Mon" (en), "lun" (es), "dl." (ca). */
export function formatWeekday(day: number): string {
	// 2024-01-01 was a Monday; UTC so the device timezone never shifts the day.
	return new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' }).format(
		new Date(Date.UTC(2024, 0, 1 + day))
	);
}
