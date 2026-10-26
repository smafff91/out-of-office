<script lang="ts">
	// After an update (LatteThanks): the answers just sent with their confirmations, the
	// Founding contributor badge if it came with this update, and the way to certification.
	// Photos are uploaded while this shows: "Uploading photos…", then the ones that failed with
	// "Try again" (the update itself is already saved).
	import type { Draft } from '#lib/contribute/draft.ts';
	import CertificationProgress from '#lib/components/place/CertificationProgress.svelte';
	import Icon from '#lib/components/place/Icon.svelte';
	import { ATTRIBUTE_PILLS } from '#lib/components/place/labels.ts';
	import { formatNumber } from '#lib/i18n/format.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { CompleteDraft, SubmitResult } from '#lib/supabase/contributions.ts';
	import type { PhotoUpload } from '#lib/supabase/photos.ts';

	type Props = {
		placeName: string;
		cityName: string;
		/** First name, when the user has one. */
		name?: string | null;
		draft: CompleteDraft & Draft;
		result: SubmitResult;
		mapHref: string;
		placeHref: string;
		uploads: PhotoUpload[];
		uploading: boolean;
		onretry: () => void;
	};

	let {
		placeName,
		cityName,
		name,
		draft,
		result,
		mapHref,
		placeHref,
		uploads,
		uploading,
		onretry
	}: Props = $props();

	const failed = $derived(uploads.filter((upload) => upload.state === 'failed').length);
	const overLimit = $derived(uploads.some((upload) => upload.state === 'limit'));

	const rows = $derived([
		{ key: 'wifi', text: ATTRIBUTE_PILLS.wifi[draft.wifi](), count: result.confirmations.wifi },
		{
			key: 'outlets',
			text: ATTRIBUTE_PILLS.outlets[draft.outlets](),
			count: result.confirmations.outlets
		},
		{ key: 'noise', text: ATTRIBUTE_PILLS.noise[draft.noise](), count: result.confirmations.noise },
		{
			key: 'long_stays',
			text: ATTRIBUTE_PILLS.long_stays[draft.longStays](),
			count: result.confirmations.longStays
		}
	]);
</script>

<section class="thanks" aria-labelledby="thanks-title">
	<div class="head">
		<span class="check"><Icon name="check" /></span>
		<h1 id="thanks-title" tabindex="-1">
			{name ? m.thanks_title_name({ name }) : m.thanks_title()}
		</h1>
		<p>
			{result.verified
				? m.thanks_body_checkin({ place: placeName })
				: m.thanks_body_update({ place: placeName })}
		</p>
		{#if result.replaced}
			<p class="replaced">{m.thanks_replaced()}</p>
		{/if}
	</div>

	{#if uploads.length > 0}
		<div class="photos" role="status">
			{#if uploading}
				<p>{m.thanks_photos_uploading()}</p>
			{:else}
				{#if failed > 0}
					<p class="failed">
						{m.thanks_photos_failed({ count: failed })} ·
						<button class="retry tap-target" type="button" onclick={onretry}>
							{m.action_try_again()}
						</button>
					</p>
				{/if}
				{#if overLimit}
					<p>{m.thanks_photos_limit()}</p>
				{/if}
			{/if}
		</div>
	{/if}

	<ul class="rows">
		{#each rows as row (row.key)}
			<li>
				<span>{row.text}</span>
				<span class="mono">
					{m.place_confirmations({ count: row.count })} · {m.thanks_just_now()}
				</span>
			</li>
		{/each}
	</ul>

	{#if result.founding}
		<div class="badge">
			<span class="shield"><Icon name="shield" /></span>
			<div>
				<strong>{m.thanks_founding_title()}</strong>
				<span>
					{m.thanks_founding_body({ count: formatNumber(result.foundingLimit), city: cityName })}
				</span>
			</div>
		</div>
	{/if}

	{#if result.level !== 'certified'}
		<CertificationProgress contributors={result.contributors} minUsers={result.minUsers} />
	{/if}

	<div class="buttons">
		<a class="primary" href={mapHref}>{m.action_find_another_place()}</a>
		<a class="secondary" href={placeHref}>{m.action_back_to_place({ place: placeName })}</a>
	</div>
</section>

<style>
	.thanks {
		min-height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 28px;
		padding: 72px 20px calc(32px + env(safe-area-inset-bottom));
		background: var(--bg);
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.check {
		width: 64px;
		height: 64px;
		border-radius: 32px;
		background: var(--accent);
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.check :global(.icon) {
		width: 30px;
		height: 30px;
		stroke-width: 2.6;
	}

	h1 {
		margin: 0;
		font-size: 34px;
		font-weight: 800;
		letter-spacing: -0.035em;
		line-height: 1.05;
		outline: none;
		overflow-wrap: anywhere;
	}

	p {
		margin: 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--muted);
	}

	.replaced {
		font-size: 14px;
	}

	.photos {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.photos p {
		font-size: 14px;
	}

	.failed {
		color: var(--danger);
	}

	.retry {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 700;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rows li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 14px 0;
		border-top: 1px solid var(--line);
		font-size: 16px;
		font-weight: 600;
	}

	.rows li:last-child {
		border-bottom: 1px solid var(--line);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 400;
		color: var(--muted);
	}

	.badge {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 18px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: 0 1px 3px var(--sh-4);
	}

	.shield {
		display: flex;
		color: var(--icon);
	}

	.shield :global(.icon) {
		width: 30px;
		height: 30px;
		stroke-width: 1.6;
	}

	.badge div {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.badge strong {
		font-size: 17px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.badge span {
		font-size: 14px;
		line-height: 1.5;
		color: var(--muted);
	}

	.buttons {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.primary,
	.secondary {
		min-height: var(--btn-height);
		padding: 0 16px;
		border-radius: var(--radius);
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		text-decoration: none;
		font-size: 16px;
		font-weight: 700;
	}

	.primary {
		background: var(--btn);
		color: var(--btnfg);
	}

	.secondary {
		background: var(--pill);
		color: var(--ink);
	}
</style>
