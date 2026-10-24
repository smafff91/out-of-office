<script lang="ts">
	// Search by place name and by neighborhood, ignoring accents, case and apostrophes.
	// variant "overlay": full-screen panel on phones; "inline": field + dropdown on desktop.
	import { getLocale } from '#lib/i18n/locale.ts';
	import type { PlaceCollection } from '#lib/map/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { distanceMeters } from '#lib/places/distance.ts';
	import type { Origin } from '#lib/places/list.ts';
	import { matchesQuery } from '#lib/places/search.ts';
	import type { AreaSummary } from '#lib/supabase/cities.ts';

	const MAX_AREAS = 5;
	const MAX_PLACES = 20;

	type Props = {
		variant: 'overlay' | 'inline';
		areas: AreaSummary[];
		places?: PlaceCollection;
		origin: Origin;
		onpickarea: (area: AreaSummary) => void;
		onpickplace: (slug: string) => void;
		/** Overlay only: back to the map. */
		onclose?: () => void;
	};

	let { variant, areas, places, origin, onpickarea, onpickplace, onclose }: Props = $props();

	let query = $state('');
	let focused = $state(false);
	let input = $state<HTMLInputElement>();

	const areaResults = $derived.by(() => {
		if (!query.trim()) return [];
		const collator = new Intl.Collator(getLocale(), { sensitivity: 'base' });
		return areas
			.filter((area) => matchesQuery(area.name, query))
			.toSorted((a, b) => collator.compare(a.name, b.name))
			.slice(0, MAX_AREAS);
	});

	const placeResults = $derived.by(() => {
		if (!query.trim() || !places) return [];
		return places.features
			.filter((feature) => matchesQuery(feature.properties.name, query))
			.map((feature) => ({
				feature,
				distance: distanceMeters(origin.point, feature.geometry.coordinates)
			}))
			.toSorted((a, b) => a.distance - b.distance)
			.slice(0, MAX_PLACES)
			.map(({ feature }) => feature);
	});

	const showResults = $derived(query.trim().length > 0 && (variant === 'overlay' || focused));

	$effect(() => {
		if (variant === 'overlay') input?.focus();
	});

	function done() {
		query = '';
		input?.blur();
		onclose?.();
	}

	function pickArea(area: AreaSummary) {
		onpickarea(area);
		done();
	}

	function pickPlace(slug: string) {
		onpickplace(slug);
		done();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') done();
	}
</script>

<div class="search {variant}" role="search">
	<div class="field">
		{#if variant === 'overlay'}
			<button
				class="icon-button tap-target"
				type="button"
				aria-label={m.action_back()}
				onclick={done}
			>
				<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
					><path d="M15 6l-6 6 6 6"></path></svg
				>
			</button>
		{:else}
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="11" cy="11" r="7"></circle>
				<path d="M20 20l-4-4"></path>
			</svg>
		{/if}
		<input
			bind:this={input}
			bind:value={query}
			type="search"
			enterkeyhint="search"
			autocomplete="off"
			spellcheck="false"
			placeholder={m.common_search_placeholder()}
			aria-label={m.search_label()}
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 150)}
			{onkeydown}
		/>
		{#if query}
			<button
				class="icon-button tap-target"
				type="button"
				aria-label={m.action_clear_search()}
				onclick={() => {
					query = '';
					input?.focus();
				}}
			>
				<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
					><path d="M6 6l12 12M18 6L6 18"></path></svg
				>
			</button>
		{/if}
	</div>

	{#if showResults}
		<div class="results" aria-live="polite">
			{#if !areaResults.length && !placeResults.length}
				<p class="none">{m.search_no_results({ query: query.trim() })}</p>
			{/if}
			{#if areaResults.length}
				<h3>{m.search_neighborhoods()}</h3>
				<ul>
					{#each areaResults as area (area.id)}
						<li>
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => pickArea(area)}
							>
								<span class="name">{area.name}</span>
								{#if area.districtName && area.districtName !== area.name}
									<span class="sub">{area.districtName}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if placeResults.length}
				<h3>{m.search_places()}</h3>
				<ul>
					{#each placeResults as place (place.properties.slug)}
						<li>
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => pickPlace(place.properties.slug)}
							>
								<span class="name">{place.properties.name}</span>
								{#if place.properties.level === 'certified'}
									<span class="seal" aria-hidden="true">
										<svg class="icon" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"></path></svg>
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: var(--surface);
		display: flex;
		flex-direction: column;
		padding: 16px var(--gutter) 0;
	}

	.inline {
		position: relative;
		width: 440px;
		max-width: 100%;
		/* In the desktop bar: gives up width first, so the buttons on the right always fit. */
		flex: 0 1 440px;
		min-width: 160px;
	}

	.field {
		height: 48px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 12px 0 16px;
		border-radius: 14px;
		background: var(--pill);
	}

	.overlay .field {
		height: 54px;
		padding: 0 8px;
		border-radius: var(--radius);
	}

	input {
		flex-grow: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 16px;
		font-weight: 600;
		color: var(--ink);
		outline: none;
	}

	input::placeholder {
		color: var(--ink);
	}

	input::-webkit-search-cancel-button {
		display: none;
	}

	.icon-button {
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 16px;
		background: transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.results {
		overflow-y: auto;
		padding-bottom: 24px;
	}

	.inline .results {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		max-height: 60vh;
		padding: 4px 16px 12px;
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: 0 8px 24px var(--sh-4);
		z-index: 20;
	}

	h3 {
		margin: 18px 0 4px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li button {
		width: 100%;
		min-height: var(--tap);
		padding: 10px 0;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		display: flex;
		align-items: center;
		gap: 8px;
		text-align: left;
		font-size: 15px;
		cursor: pointer;
	}

	.name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sub {
		margin-left: auto;
		font-size: 13px;
		color: var(--muted);
		white-space: nowrap;
	}

	.none {
		margin: 18px 0 0;
		font-size: 15px;
		color: var(--muted);
	}
</style>
