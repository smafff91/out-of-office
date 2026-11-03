<script lang="ts">
	// One work attribute on the place page (LattePlace): name, prevailing value, how many people
	// confirmed it and when the latest did, or "From our team · Oct 2026" for the team's value.
	// Unknown: a dashed tile (LattePlaceCommunity).
	import { formatDaysAgo } from '#lib/i18n/format.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { daysSince } from '#lib/places/dates.ts';
	import Icon from './Icon.svelte';
	import { fromTeamLabel } from './labels.ts';
	import type { IconName } from './icons.ts';

	type Props = {
		icon: IconName;
		name: string;
		/** Undefined: nobody answered yet. */
		value?: string;
		confirmations?: number;
		lastConfirmedOn?: string;
		/** The team's value: its month ("YYYY-MM") instead of confirmations. */
		teamMonth?: string;
		timezone: string;
		/** Unknown attribute: "Add it" opens the contribution form. */
		addHref?: string;
	};

	let {
		icon,
		name,
		value,
		confirmations = 0,
		lastConfirmedOn,
		teamMonth,
		timezone,
		addHref
	}: Props = $props();

	const freshness = $derived(
		teamMonth
			? fromTeamLabel(teamMonth)
			: lastConfirmedOn
				? [
						m.place_confirmations({ count: confirmations }),
						formatDaysAgo(daysSince(lastConfirmedOn, timezone))
					].join(' · ')
				: undefined
	);
</script>

<div class="tile" class:empty={!value}>
	<span class="glyph"><Icon name={icon} /></span>
	<span class="name">{name}</span>
	<span class="value">{value ?? m.place_not_known()}</span>
	{#if freshness}
		<span class="fresh">{freshness}</span>
	{:else if !value && addHref}
		<a class="add tap-target" href={addHref}>{m.action_add_it()}</a>
	{/if}
</div>

<style>
	.tile {
		background: var(--surface);
		border-radius: 18px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		box-shadow: 0 1px 3px var(--sh-4);
	}

	.tile.empty {
		background: transparent;
		box-shadow: none;
		border: 1.5px dashed var(--line);
	}

	.glyph {
		color: var(--icon);
		display: flex;
	}

	.empty .glyph,
	.empty .value {
		color: var(--muted);
	}

	.name {
		font-size: 12px;
		font-weight: 500;
		color: var(--muted);
	}

	.value {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: var(--tracking-tight);
	}

	.add {
		align-self: flex-start;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink);
	}

	.fresh {
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.4;
		color: var(--muted);
	}
</style>
