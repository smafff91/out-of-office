<script lang="ts">
	// The rows of the list, by section (Top rated: rated, then "Not enough votes yet", then
	// places without votes), with "Show more".
	import * as m from '#lib/paraglide/messages.js';
	import type { Section, SectionId, Sort } from '#lib/places/list.ts';
	import type { ListItem } from '#lib/supabase/places.ts';
	import PlaceRow from './PlaceRow.svelte';

	type Props = {
		sections: Section[];
		items: ReadonlyMap<string, ListItem>;
		citySlug: string;
		sort: Sort;
		showDistance: boolean;
		selected?: string;
		hasMore: boolean;
		onselect: (slug: string) => void;
		onshowmore: () => void;
	};

	let {
		sections,
		items,
		citySlug,
		sort,
		showDistance,
		selected,
		hasMore,
		onselect,
		onshowmore
	}: Props = $props();

	const TITLES: Partial<Record<SectionId, () => string>> = {
		few_votes: m.list_not_enough_votes,
		no_votes: m.place_no_work_info
	};
</script>

<div class="list">
	{#each sections as section (section.id)}
		{@const title = sort === 'top' ? TITLES[section.id] : undefined}
		{#if title}
			<h3>{title()}</h3>
		{/if}
		<ul>
			{#each section.entries as entry (entry.slug)}
				<li>
					<PlaceRow
						{entry}
						item={items.get(entry.slug)}
						{citySlug}
						{sort}
						{showDistance}
						selected={entry.slug === selected}
						{onselect}
					/>
				</li>
			{/each}
		</ul>
	{/each}
	{#if hasMore}
		<button class="more" type="button" onclick={onshowmore}>{m.action_show_more()}</button>
	{/if}
</div>

<style>
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	h3 {
		margin: 0;
		padding: 14px 0 6px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.more {
		width: 100%;
		height: var(--btn-height);
		margin-top: 12px;
		border: 0;
		border-radius: var(--radius);
		background: var(--pill);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}
</style>
