<script lang="ts">
	// Area choice when location is off (LatteLocationOff): the 12 neighborhoods with the most
	// certified places (then the most places). "All neighborhoods" groups every neighborhood by
	// district; districts and neighborhoods in alphabetical order of their full names.
	import { getLocale } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { AreaSummary } from '#lib/supabase/cities.ts';

	const TOP_AREAS = 12;

	type Props = { city: string; areas: AreaSummary[]; onpick: (area: AreaSummary) => void };

	let { city, areas, onpick }: Props = $props();

	let showAll = $state(false);

	const top = $derived(
		areas.toSorted((a, b) => b.certified - a.certified || b.places - a.places).slice(0, TOP_AREAS)
	);

	const districts = $derived.by(() => {
		const collator = new Intl.Collator(getLocale(), { sensitivity: 'base' });
		const groups: Record<string, { id: string; name: string; areas: AreaSummary[] }> = {};
		for (const area of areas) {
			const id = area.districtId ?? '';
			groups[id] ??= { id, name: area.districtName ?? '', areas: [] };
			groups[id].areas.push(area);
		}
		return Object.values(groups)
			.map((group) => ({
				...group,
				areas: group.areas.toSorted((a, b) => collator.compare(a.name, b.name))
			}))
			.toSorted((a, b) => collator.compare(a.name, b.name));
	});
</script>

{#snippet chips(list: AreaSummary[])}
	<ul>
		{#each list as area (area.id)}
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
{/snippet}

<div class="areas">
	<h2>{m.location_areas_in({ city })}</h2>
	{#if showAll}
		{#each districts as district (district.id)}
			{#if district.name}
				<h3>{district.name}</h3>
			{/if}
			{@render chips(district.areas)}
		{/each}
	{:else}
		{@render chips(top)}
	{/if}
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

	h3 {
		margin: 8px 0 0;
		font-size: 15px;
		font-weight: 700;
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
