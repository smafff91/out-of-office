<script lang="ts">
	// Temporary token showcase; replaced by the map Home in feature 4.
	import { APP_NAME } from '#lib/config.ts';
	import { formatDaysAgo, formatNumber, formatPercent } from '#lib/i18n/format.ts';
	import { getLocale, LOCALE_NAMES, locales, setLocale } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const activeLocale = getLocale();

	// Palette names come from the design system (docs/design-ux.md): they are not translated.
	const swatches = [
		['Milk', '--bg'],
		['Surface', '--surface'],
		['Espresso', '--ink'],
		['Roast', '--muted'],
		['Line', '--line'],
		['Crema', '--accent'],
		['Icon', '--icon'],
		['Foam', '--pill'],
		['Photo', '--photo'],
		['Danger', '--danger'],
		['Map', '--map'],
		['Blocks', '--blk'],
		['Water', '--water'],
		['Dot', '--dot'],
		['Pin check', '--pinfg']
	] as const;

	const monoSamples = [
		formatPercent(0.94),
		m.place_score_few({ yes: 2, total: 2 }),
		formatDaysAgo(3),
		formatNumber(2453)
	];

	const formattingSamples = [
		m.place_score({ percent: formatPercent(0.94) }),
		m.place_confirmed_by({ count: 1 }),
		m.place_confirmed_by({ count: 4 }),
		m.place_votes({ count: 17 }),
		m.place_certification_progress({ count: 2, total: 10 }),
		formatDaysAgo(0),
		formatDaysAgo(1),
		formatDaysAgo(21),
		m.city_not_yet({ city: 'Lisboa' })
	];

	let hex = $state<Record<string, string>>({});

	$effect(() => {
		const style = getComputedStyle(document.documentElement);
		hex = Object.fromEntries(
			swatches.map(([, name]) => [name, style.getPropertyValue(name).trim().toUpperCase()])
		);
	});
</script>

<svelte:head>
	<title>{m.tokens_title()} · {APP_NAME}</title>
</svelte:head>

<main>
	<header>
		<h1>{APP_NAME}</h1>
		<p class="muted">{m.tokens_intro()}</p>
	</header>

	<section>
		<h2>{m.common_language()}</h2>
		<div class="segmented" role="group" aria-label={m.common_language()}>
			{#each locales as locale (locale)}
				<button
					type="button"
					lang={locale}
					aria-pressed={locale === activeLocale}
					onclick={() => setLocale(locale)}
				>
					{LOCALE_NAMES[locale]}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h2>{m.tokens_formatting()}</h2>
		<ul class="samples">
			{#each formattingSamples as sample (sample)}
				<li>{sample}</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>{m.tokens_database()}</h2>
		{#if data.dbError}
			<p class="danger">{m.tokens_db_unavailable()}</p>
		{:else}
			{#each data.cities as city (city.slug)}
				<p class="body">{m.tokens_city_from_db()} <strong>{city.name}</strong></p>
			{/each}
		{/if}
	</section>

	<section>
		<h2>{m.tokens_colors()}</h2>
		<ul class="swatches">
			{#each swatches as [label, name] (name)}
				<li>
					<span class="chip" style:background="var({name})"></span>
					<span class="label">{label}</span>
					<span class="mono muted">{name}</span>
					<span class="mono muted">{hex[name] ?? ''}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>{m.tokens_type()}</h2>
		<p class="title">{m.home_work_nearby()}</p>
		<p class="body">{m.tokens_body_sample()}</p>
		<p class="muted small">
			{m.place_walk_time({ minutes: 3 })} · {m.place_open_until({ time: '20:00' })}
		</p>
		<p class="mono-row">
			{#each monoSamples as sample (sample)}
				<span class="mono">{sample}</span>
			{/each}
		</p>
	</section>

	<section>
		<h2>{m.tokens_components()}</h2>
		<div class="stack">
			<button class="btn-primary" type="button">{m.action_add_experience()}</button>
			<button class="btn-secondary" type="button">{m.action_report_problem()}</button>
			<div>
				<button class="certified-chip tap-target" type="button">
					<span class="seal" aria-hidden="true">
						<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"></path></svg>
					</span>
					{m.common_certified()}
				</button>
			</div>
			<div class="pills">
				{#each [m.attribute_wifi_fast(), m.attribute_outlets_plenty(), m.attribute_noise_quiet()] as pill (pill)}
					<span class="pill">{pill}</span>
				{/each}
			</div>
			<p class="muted small">{m.place_confirmed_by({ count: 4 })}</p>
		</div>
	</section>
</main>

<style>
	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 24px var(--gutter) 48px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	h1 {
		margin: 0 0 6px;
		font-size: 32px;
		font-weight: 800;
		letter-spacing: var(--tracking-title);
	}

	h2 {
		margin: 0 0 14px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	p {
		margin: 0;
	}

	.muted {
		color: var(--muted);
	}

	.danger {
		color: var(--danger);
	}

	.small {
		font-size: 13px;
	}

	.mono {
		font-family: var(--font-mono);
	}

	.swatches {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 12px;
	}

	.swatches li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
	}

	.swatches .mono {
		font-size: 11px;
	}

	.chip {
		height: 56px;
		border-radius: 12px;
		border: 1px solid var(--line);
		margin-bottom: 6px;
	}

	.label {
		font-weight: 600;
	}

	.title {
		font-size: 24px;
		font-weight: 800;
		letter-spacing: var(--tracking-title);
		margin-bottom: 8px;
	}

	.body {
		font-size: 17px;
		margin-bottom: 4px;
	}

	.mono-row {
		display: flex;
		gap: 16px;
		margin-top: 10px;
		font-size: 15px;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 358px;
	}

	.btn-primary,
	.btn-secondary {
		height: var(--btn-height);
		border: 0;
		border-radius: var(--radius);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.btn-primary {
		background: var(--btn);
		color: var(--btnfg);
	}

	.btn-secondary {
		background: var(--pill);
		color: var(--ink);
	}

	.certified-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 14px 0 10px;
		border-radius: 19px;
		border: 0;
		background: var(--surface);
		box-shadow: 0 2px 8px var(--sh-4);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.seal {
		width: 18px;
		height: 18px;
		border-radius: 9px;
		background: var(--accent);
		color: var(--ink);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.seal svg {
		width: 11px;
		height: 11px;
		fill: none;
		stroke: currentColor;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
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
	.segmented {
		display: inline-flex;
		gap: 4px;
		padding: 4px;
		border-radius: 14px;
		background: var(--pill);
	}

	.segmented button {
		min-height: var(--tap);
		padding: 0 16px;
		border: 0;
		border-radius: 11px;
		background: transparent;
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}

	.segmented button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 4px var(--sh-2);
	}

	.samples {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 15px;
	}
</style>
