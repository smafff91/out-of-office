/**
 * A small reader for the common shapes of the OSM opening_hours tag, e.g.
 *   "Mo-Fr 08:00-20:00; Sa 09:00-14:00", "Tu-Su 10:00-16:00, 19:00-23:00", "24/7",
 *   "Mo-Su 18:00-02:30" (past midnight), "Sa-Su off", "07:00-22:00" (every day).
 * Anything it cannot read with certainty (public or school holidays, months, weeks, dates,
 * comments, open ends, "||" fallbacks, days without times…) gives undefined: no hours shown
 * is better than wrong hours.
 *
 * Open/closed is computed in the city's timezone, never the device's.
 */

export type OpeningStatus =
	| { state: 'open_24h' }
	| { state: 'open'; until: string }
	| { state: 'opens'; at: string }
	| { state: 'closed_today' };

/** [start, end] in minutes from the start of the day; end may pass 1440 (after midnight). */
type Interval = [number, number];
/** Monday = 0 … Sunday = 6. */
type Week = Interval[][];

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
const DAY_ITEM = `${DAY}(?:\\s*-\\s*${DAY})?`;
const DAY_SELECTOR = new RegExp(`^${DAY_ITEM}(?:\\s*,\\s*${DAY_ITEM})*$`);
const TIME = '(?:[01]\\d|2[0-4]):[0-5]\\d';
const TIME_RANGE = `${TIME}\\s*-\\s*${TIME}`;
const TIMES = new RegExp(`^${TIME_RANGE}(?:\\s*,\\s*${TIME_RANGE})*$`);
const RULE = new RegExp(`^(?:(${DAY_ITEM}(?:\\s*,\\s*${DAY_ITEM})*)\\s+)?(.+)$`);

const minutes = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};

function parseDays(selector: string): number[] | undefined {
	if (!DAY_SELECTOR.test(selector)) return undefined;
	const days = new Set<number>();
	for (const item of selector.split(',')) {
		const [from, to] = item.split('-').map((day) => DAYS.indexOf(day.trim()));
		if (to === undefined) {
			days.add(from);
			continue;
		}
		// Ranges may wrap around the week ("Fr-Mo").
		for (let day = from; ; day = (day + 1) % 7) {
			days.add(day);
			if (day === to) break;
		}
	}
	return [...days];
}

function parseTimes(text: string): Interval[] | undefined {
	if (!TIMES.test(text)) return undefined;
	const intervals: Interval[] = [];
	for (const range of text.split(',')) {
		const [start, rawEnd] = range.split('-').map((part) => minutes(part.trim()));
		if (start >= 1440) return undefined;
		// "18:00-02:00" ends after midnight; "08:00-08:00" is not something we trust.
		const end = rawEnd <= start ? rawEnd + 1440 : rawEnd;
		if (end === start || end - start > 1440) return undefined;
		intervals.push([start, end]);
	}
	return intervals;
}

/** The weekly schedule, or undefined when the text is not one of the shapes we trust. */
export function parseOpeningHours(text: string): Week | undefined {
	const value = text.trim();
	if (value === '24/7') return Array.from({ length: 7 }, () => [[0, 1440]]);
	if (!value || /["|]/.test(value)) return undefined;

	const week: Week = Array.from({ length: 7 }, () => []);
	for (const rawRule of value.split(';')) {
		const rule = rawRule.trim();
		if (!rule) continue;
		const match = RULE.exec(rule);
		if (!match) return undefined;
		const [, selector, body] = match;
		const days = selector ? parseDays(selector) : [0, 1, 2, 3, 4, 5, 6];
		if (!days) return undefined;
		const closed = body === 'off' || body === 'closed';
		const intervals = closed ? [] : parseTimes(body);
		if (!intervals) return undefined;
		// A later rule replaces earlier ones for the days it names (OSM semantics).
		for (const day of days) week[day] = intervals;
	}
	return week;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (total: number) => `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`;

/** Weekday (Monday = 0) and minutes since midnight, in the given timezone. */
function localNow(now: Date, timeZone: string): { day: number; minute: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
	return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Status right now: open (until when), opens later today (at what time), or closed for the
 * rest of the day. Times are "HH:MM"; format them with formatTime(). Undefined when the hours
 * are missing or not readable with certainty.
 */
export function openingStatus(
	text: string | null | undefined,
	timeZone: string,
	now: Date = new Date()
): OpeningStatus | undefined {
	if (!text) return undefined;
	const week = parseOpeningHours(text);
	if (!week) return undefined;
	if (week.every((day) => day.length === 1 && day[0][0] === 0 && day[0][1] >= 1440)) {
		return { state: 'open_24h' };
	}

	const { day, minute } = localNow(now, timeZone);
	const yesterday = week[(day + 6) % 7];
	const today = week[day];

	// Still open from last night ("Fr 20:00-03:00" seen on Saturday at 01:00).
	for (const [, end] of yesterday) {
		if (end > 1440 && minute < end - 1440) return { state: 'open', until: hhmm(end - 1440) };
	}
	for (const [start, end] of today) {
		if (minute >= start && minute < end) return { state: 'open', until: hhmm(end) };
	}
	const next = today.filter(([start]) => start > minute).sort((a, b) => a[0] - b[0])[0];
	return next ? { state: 'opens', at: hhmm(next[0]) } : { state: 'closed_today' };
}
