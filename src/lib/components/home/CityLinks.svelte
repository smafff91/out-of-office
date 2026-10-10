<script lang="ts">
	// Open cities as plain links (LatteNoCity "Open now" rows): work without JavaScript too.
	import { localizeHref } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { CitySummary } from '#lib/supabase/cities.ts';

	let { cities }: { cities: CitySummary[] } = $props();
</script>

<div class="cities">
	<h2>{m.home_open_cities()}</h2>
	<ul>
		{#each cities as city (city.id)}
			<li>
				<a href={localizeHref(`/${city.slug}`)}>
					<span>{city.name}</span>
					<span class="stats">
						{m.common_certified_count({ count: city.certified })} · {m.common_places_count({
							count: city.places
						})}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	h2 {
		margin: 0 0 10px;
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
	}

	li {
		border-top: 1px solid var(--line);
	}

	li:last-child {
		border-bottom: 1px solid var(--line);
	}

	a {
		min-height: var(--tap);
		padding: 13px 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
	}

	.stats {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 400;
		color: var(--muted);
		text-align: right;
	}
</style>
