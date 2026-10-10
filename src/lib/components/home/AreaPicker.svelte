<script lang="ts">
	// Area choice when location is off (LatteLocationOff): the 12 neighborhoods with the most
	// certified places (then the most places), and "All neighborhoods" in alphabetical order.
	import { getLocale } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { AreaSummary } from '#lib/supabase/cities.ts';

	const TOP_AREAS = 12;

	/**
	 * Leading article ignored when sorting (Catalan names such as "el Raval", "l'Antiga
	 * Esquerra…", "les Corts"); the full name is still shown.
	 */
	const LEADING_ARTICLE = /^(el|la|els|les)\s+|^l['’]/i;
	const sortName = (name: string) => name.replace(LEADING_ARTICLE, '');

	type Props = { city: string; areas: AreaSummary[]; onpick: (area: AreaSummary) => void };

	let { city, areas, onpick }: Props = $props();

	let showAll = $state(false);

	const shown = $derived.by(() => {
		if (showAll) {
			const collator = new Intl.Collator(getLocale(), { sensitivity: 'base' });
			return areas.toSorted((a, b) => collator.compare(sortName(a.name), sortName(b.name)));
		}
		return areas
			.toSorted((a, b) => b.certified - a.certified || b.places - a.places)
			.slice(0, TOP_AREAS);
	});
</script>

<div class="areas">
	<h2>{m.location_areas_in({ city })}</h2>
	<ul>
		{#each shown as area (area.id)}
			<li>
				<button type="button" onclick={() => onpick(area)}>
					{area.name}
					<span class="count">
						{area.certified > 0
							? m.common_certified_count({ count: area.certified })
							: m.common_places_count({ count: area.places })}
					</span>
				</button>
			</li>
		{/each}
	</ul>
	{#if !showAll && areas.length > TOP_AREAS}
		<button class="all" type="button" onclick={() => (showAll = true)}>
			{m.location_all_neighborhoods()}
		</button>
	{/if}
</div>

<style>
	.areas {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	li button {
		min-height: var(--tap);
		padding: 0 14px;
		border-radius: 22px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 14px;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.count {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 400;
		color: var(--muted);
	}

	.all {
		align-self: flex-start;
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		font-size: 14px;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
</style>
