<script lang="ts">
	// The language picker, in the phone account sheet and the desktop language dialog. Built
	// from the compiled locales (language-list.ts): one list up to 6 languages, then "Suggested"
	// and "All languages", with a search field beyond 10. Picking one reloads the same page with
	// everything kept in place (locale.ts, handoff.ts).
	import { page } from '$app/state';
	import { getLocale, locales, setLocale, type Locale } from '#lib/i18n/locale.ts';
	import {
		buildLanguageList,
		filterLanguages,
		type LanguageEntry
	} from '#lib/i18n/language-list.ts';
	import * as m from '#lib/paraglide/messages.js';

	type Props = {
		/** Several columns (desktop dialog) instead of one (phone sheet). */
		columns?: boolean;
		/** After a pick of the language already on screen (nothing to reload). */
		onsame?: () => void;
	};

	let { columns = false, onsame }: Props = $props();

	const uid = $props.id();
	const current = getLocale();
	let query = $state('');

	const list = $derived(
		buildLanguageList({
			locales,
			displayLocale: current,
			browser: typeof navigator === 'undefined' ? [] : navigator.languages,
			city: (page.data.city as { languages?: string[] } | undefined)?.languages ?? []
		})
	);
	const searching = $derived(list.layout === 'grouped' && list.searchable && query.trim() !== '');
	const found = $derived(searching ? filterLanguages(list.all, query) : []);

	function pick(locale: string) {
		if (locale === current) onsame?.();
		else setLocale(locale as Locale);
	}
</script>

{#snippet entries(items: LanguageEntry[], labelledby?: string)}
	<ul class="entries" class:columns aria-labelledby={labelledby}>
		{#each items as entry (entry.locale)}
			<li>
				<button
					class="entry"
					type="button"
					aria-current={entry.locale === current ? 'true' : undefined}
					onclick={() => pick(entry.locale)}
				>
					<span class="names">
						<span class="native" lang={entry.locale}>{entry.nativeName}</span>
						{#if entry.localName !== entry.nativeName}
							<span class="local">{entry.localName}</span>
						{/if}
					</span>
					{#if entry.locale === current}
						<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
							><path d="M5 12l5 5L20 7"></path></svg
						>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="languages">
	{#if list.layout === 'grouped' && list.searchable}
		<label class="visually-hidden" for="{uid}-search">{m.language_search()}</label>
		<input
			id="{uid}-search"
			class="search"
			type="search"
			autocomplete="off"
			placeholder={m.language_search()}
			bind:value={query}
		/>
	{/if}

	{#if list.layout === 'single'}
		{@render entries(list.all)}
	{:else if searching}
		{#if found.length}
			{@render entries(found)}
		{:else}
			<p class="none" role="status">{m.language_none()}</p>
		{/if}
	{:else}
		{#if list.suggested.length}
			<h3 id="{uid}-suggested">{m.language_suggested()}</h3>
			{@render entries(list.suggested, `${uid}-suggested`)}
		{/if}
		<h3 id="{uid}-all">{m.language_all()}</h3>
		{@render entries(list.all, `${uid}-all`)}
	{/if}
</div>

<style>
	.languages {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	h3 {
		margin: 8px 0 0;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.entries {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	.entries.columns {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 4px 12px;
	}

	.entry {
		width: 100%;
		min-height: 56px;
		padding: 8px 12px;
		border: 0;
		border-radius: 12px;
		background: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		text-align: left;
		cursor: pointer;
	}

	.entry:hover {
		background: var(--pill);
	}

	.entry[aria-current='true'] {
		background: var(--pill);
	}

	.names {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.native {
		font-size: 16px;
		font-weight: 700;
	}

	.local {
		font-size: 13px;
		color: var(--muted);
	}

	.search {
		height: 48px;
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 0 16px;
		font: 400 16px var(--font-sans);
		background: var(--bg);
		color: var(--ink);
	}

	.none {
		margin: 0;
		padding: 12px;
		font-size: 15px;
		color: var(--muted);
	}
</style>
