/**
 * Days as the database sends them: "YYYY-MM-DD" in the city's timezone (never exact times).
 */

/** Today's date in the given timezone, as "YYYY-MM-DD". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
	// en-CA formats dates as YYYY-MM-DD.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

/** Whole days from `day` to today in the city (0 = today); never negative. */
export function daysSince(day: string, timeZone: string, now: Date = new Date()): number {
	const diff = Date.parse(todayIn(timeZone, now)) - Date.parse(day);
	return Math.max(0, Math.round(diff / 86_400_000));
}
