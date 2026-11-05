<script lang="ts">
	// One list row (LatteList). A real link to the place page for search engines and new tabs;
	// a plain tap is intercepted: the preview on phones, the place page in the panel on desktop.
	import AmenityIcon from '#lib/components/place/AmenityIcon.svelte';
	import {
		ATTRIBUTE_PILLS,
		LAPTOP_RULES,
		distanceLabel,
		openingLabel
	} from '#lib/components/place/labels.ts';
	import { formatPercent } from '#lib/i18n/format.ts';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { ListEntry, Sort } from '#lib/places/list.ts';
	import type { ListItem } from '#lib/supabase/places.ts';
	import { publicPhotoUrl } from '#lib/supabase/photos.ts';

	type Props = {
		entry: ListEntry;
		/** Undefined while the row details load: a "ghost" row is shown. */
		item?: ListItem;
		citySlug: string;
		sort: Sort;
		/** Only when the list starts from the user's real position. */
		showDistance: boolean;
		selected: boolean;
		onselect: (slug: string) => void;
	};

	let { entry, item, citySlug, sort, showDistance, selected, onselect }: Props = $props();

	const unchecked = $derived(entry.level === 'osm_only');
	const cover = $derived(item?.coverPath ? publicPhotoUrl('thumb', item.coverPath) : undefined);

	const distance = $derived(showDistance ? distanceLabel(entry.distance) : undefined);
	const hours = $derived(
		item ? openingLabel(item.openingHours, item.timezone, { form: 'short' }) : undefined
	);

	const meta = $derived(
		[
			distance,
			item?.neighborhood,
			sort === 'top' && item?.votes ? m.place_votes({ count: item.votes }) : hours
		].filter(Boolean)
	);

	const pills = $derived(
		item && sort === 'nearest'
			? [
					item.wifi && ATTRIBUTE_PILLS.wifi[item.wifi](),
					item.outlets && ATTRIBUTE_PILLS.outlets[item.outlets](),
					item.noise && ATTRIBUTE_PILLS.noise[item.noise]()
				].filter((pill): pill is string => !!pill)
			: []
	);

	function onclick(event: MouseEvent) {
		// New tab, new window, download: let the browser follow the link.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}
		event.preventDefault();
		onselect(entry.slug);
	}
</script>

<a
	class="row"
	class:selected
	href={localizeHref(`/${citySlug}/${entry.slug}`)}
	aria-current={selected ? 'true' : undefined}
	data-slug={entry.slug}
	{onclick}
>
	<!-- The latest photo's thumbnail; without photos a cup for cafés, a glass for bars. -->
	<div class={unchecked ? 'ghost' : 'photo'} aria-hidden="true">
		{#if cover}
			<img src={cover} alt="" loading="lazy" />
		{:else}
			<AmenityIcon amenity={item?.amenity ?? null} />
		{/if}
	</div>
	<div class="text">
		<div class="name-row">
			<span class="name" class:muted={unchecked}>{entry.name}</span>
			{#if entry.level === 'certified'}
				<span class="seal" title={m.common_certified()}>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
						><path d="M5 12l5 5L20 7"></path></svg
					>
					<span class="visually-hidden">{m.common_certified()}</span>
				</span>
			{/if}
			{#if item?.hasScore && item.scorePct !== null}
				<span
					class="score"
					aria-label={m.place_score({ percent: formatPercent(item.scorePct / 100) })}
				>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
						><path
							d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"
						></path></svg
					>
					{formatPercent(item.scorePct / 100)}
				</span>
			{:else if item?.votes}
				<span class="few">{m.place_score_few({ yes: item.yesVotes, total: item.votes })}</span>
			{/if}
		</div>
		{#if item || unchecked}
			{#if meta.length}
				<span class="meta">{meta.join(' · ')}</span>
			{/if}
			{#if unchecked}
				<span class="meta">{m.place_no_work_info()}</span>
			{:else if pills.length || item?.laptopRules.length}
				<div class="pills">
					{#each pills as pill (pill)}
						<span class="pill">{pill}</span>
					{/each}
					{#if sort === 'nearest'}
						{#each item?.laptopRules ?? [] as rule (rule)}
							<span class="pill rule">{LAPTOP_RULES[rule]()}</span>
						{/each}
					{/if}
				</div>
			{/if}
		{:else}
			<span class="skeleton" aria-hidden="true"></span>
		{/if}
	</div>
</a>

<style>
	.row {
		display: flex;
		gap: 14px;
		align-items: center;
		padding: 12px 0;
		border-top: 1px solid var(--line);
		text-decoration: none;
	}

	.row.selected {
		background: var(--bg);
		box-shadow:
			-20px 0 0 var(--bg),
			20px 0 0 var(--bg);
	}

	.photo,
	.ghost {
		width: 64px;
		height: 64px;
		border-radius: var(--radius);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.photo :global(.icon),
	.ghost :global(.icon) {
		width: 24px;
		height: 24px;
	}

	.photo {
		background: var(--photo);
		color: var(--icon);
		overflow: hidden;
	}

	.photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.ghost {
		border: 1.5px dashed var(--line);
		color: var(--dot);
	}

	.text {
		flex-grow: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.name {
		font-size: 17px;
		font-weight: 700;
		letter-spacing: var(--tracking-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name.muted {
		font-weight: 600;
		color: var(--muted);
	}

	.score {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 15px;
		font-weight: 800;
		letter-spacing: var(--tracking-tight);
		white-space: nowrap;
	}

	.score .icon {
		width: 16px;
		height: 16px;
	}

	.few {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}

	.meta {
		font-size: 13px;
		color: var(--muted);
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.pill {
		font-size: 12px;
		font-weight: 500;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		background: var(--pill);
		white-space: nowrap;
	}

	/* Laptop rules stand out with a Roast outline: crema is for certified places only. */
	.pill.rule {
		background: transparent;
		border: 1.5px solid var(--muted);
		padding: 2.5px 6.5px;
	}

	.skeleton {
		width: 60%;
		height: 12px;
		border-radius: 6px;
		background: var(--pill);
	}
</style>
