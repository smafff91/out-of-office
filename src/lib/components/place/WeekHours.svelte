<script lang="ts">
	// The week's opening hours, Monday first, today in bold (in the city's timezone).
	// Only for hours read with certainty: the parent shows nothing otherwise.
	import { formatTime, formatWeekday } from '#lib/i18n/format.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { weekdayIn, type DayHours } from '#lib/places/opening-hours.ts';

	let { week, timezone }: { week: DayHours[]; timezone: string } = $props();

	const today = $derived(weekdayIn(timezone));

	function hours(day: DayHours): string {
		if (day.allDay) return m.place_open_24h();
		if (!day.intervals.length) return m.place_closed();
		return day.intervals
			.map(([open, close]) => `${formatTime(open)}–${formatTime(close)}`)
			.join(', ');
	}
</script>

<dl>
	{#each week as day (day.day)}
		<div class:today={day.day === today}>
			<dt>{formatWeekday(day.day)}</dt>
			<dd>{hours(day)}</dd>
		</div>
	{/each}
</dl>

<style>
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	div {
		display: flex;
		gap: 12px;
		font-size: 14px;
		color: var(--muted);
	}

	div.today {
		color: var(--ink);
		font-weight: 600;
	}

	dt {
		width: 48px;
		flex-shrink: 0;
		text-transform: capitalize;
	}

	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
</style>
