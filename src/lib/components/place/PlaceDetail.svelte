<script lang="ts">
	// The place page (LattePlace, LattePlaceCommunity, LattePlaceUnverified). Full screen on
	// phones; the left panel on desktop, with the city map on the right.
	// The user's position is used only if already granted, for the walking time and the dot on
	// the small map; it never moves the map.
	import { onMount } from 'svelte';
	import { formatDate, formatDaysAgo, formatPercent } from '#lib/i18n/format.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { CityMap, type LngLat } from '#lib/map/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { certificationOrigin, certificationRemoved } from '#lib/places/certification.ts';
	import { joinNames } from '#lib/places/contributors.ts';
	import { daysSince } from '#lib/places/dates.ts';
	import { distanceMeters } from '#lib/places/distance.ts';
	import { weekSchedule } from '#lib/places/opening-hours.ts';
	import { directionsUrl } from '#lib/platform/directions.ts';
	import { getPositionIfGranted } from '#lib/platform/geolocation.ts';
	import { shareLink } from '#lib/platform/share.ts';
	import {
		toFeature,
		type Known,
		type PlaceDetail,
		type Provenance
	} from '#lib/supabase/place-details.ts';
	import AttributeTile from './AttributeTile.svelte';
	import CertificationProgress from './CertificationProgress.svelte';
	import Icon from './Icon.svelte';
	import PhotoGallery from './PhotoGallery.svelte';
	import WeekHours from './WeekHours.svelte';
	import {
		ATTRIBUTE_NAMES,
		ATTRIBUTE_VALUES,
		EXTRAS,
		distanceLabel,
		fromTeamLabel,
		laptopRuleLabel,
		openingLabel,
		osmWifi
	} from './labels.ts';
	import type { IconName } from './icons.ts';

	type Props = {
		place: PlaceDetail;
		/** Canonical address of the page, for Share. */
		url: string;
		/** Where Back goes without JavaScript (the city map). */
		backHref: string;
		/** The contribution form (/{city}/{place}/update). */
		updateHref: string;
		onback: (event: MouseEvent) => void;
	};

	let { place, url, backHref, updateHref, onback }: Props = $props();

	const NOTICE_MS = 3000;
	const DESKTOP_QUERY = '(min-width: 1024px)';

	let user = $state<LngLat>();
	let smallMap = $state(false);
	let notice = $state<string>();
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	const certified = $derived(place.level === 'certified');
	const unchecked = $derived(place.level === 'osm_only');
	const week = $derived(weekSchedule(place.openingHours));
	const wifiFromOsm = $derived(osmWifi(place.internetAccessOsm));

	const meta = $derived(
		[
			unchecked && place.amenity
				? place.amenity === 'bar'
					? m.place_kind_bar()
					: m.place_kind_cafe()
				: undefined,
			place.neighborhood,
			user ? distanceLabel(distanceMeters(user, place.point)) : undefined,
			openingLabel(place.openingHours, place.timezone)
		].filter(Boolean)
	);

	const origin = $derived(certificationOrigin(place));
	const removed = $derived(certificationRemoved(place));

	const tiles = $derived.by(() => {
		const { wifi, outlets, noise, long_stays } = place.attributes;
		const tile = <T extends string>(
			icon: IconName,
			key: keyof typeof ATTRIBUTE_NAMES,
			values: Record<T, () => string>,
			attribute: Known<T> | undefined
		) => ({
			icon,
			key,
			name: ATTRIBUTE_NAMES[key](),
			value: attribute ? values[attribute.value]() : undefined,
			...(attribute?.source === 'users' && {
				confirmations: attribute.confirmations,
				lastConfirmedOn: attribute.lastConfirmedOn
			}),
			...(attribute?.source === 'team' && { teamMonth: attribute.month })
		});
		return [
			tile('wifi', 'wifi', ATTRIBUTE_VALUES.wifi, wifi),
			tile('outlets', 'outlets', ATTRIBUTE_VALUES.outlets, outlets),
			tile('noise', 'noise', ATTRIBUTE_VALUES.noise, noise),
			tile('clock', 'long_stays', ATTRIBUTE_VALUES.long_stays, long_stays)
		];
	});

	/** "Shared by Luca and Ana": names only, never a date or an identifier next to them. */
	const sharedBy = $derived.by(() => {
		const names = joinNames(place.contributorNames ?? [], {
			locale: getLocale(),
			others: (count) => m.place_others({ count })
		});
		return names ? m.place_shared_by({ names }) : undefined;
	});

	const osmUrl = $derived(
		place.osm ? `https://www.openstreetmap.org/${place.osm.type}/${place.osm.id}` : undefined
	);

	onMount(() => {
		smallMap = !window.matchMedia(DESKTOP_QUERY).matches;
		void getPositionIfGranted().then((position) => {
			if (position) user = [position.lng, position.lat];
		});
		return () => clearTimeout(noticeTimer);
	});

	async function share() {
		const result = await shareLink({ title: place.name, url });
		if (result === 'copied') showNotice(m.share_copied());
		else if (result === 'failed') showNotice(m.share_failed());
	}

	function showNotice(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = undefined), NOTICE_MS);
	}

	/** "2 confirmations · 3 days ago", or "From our team · Oct 2026". */
	function provenanceLabel(known: Provenance) {
		return known.source === 'team'
			? fromTeamLabel(known.month)
			: `${m.place_confirmations({ count: known.confirmations })} · ${formatDaysAgo(daysSince(known.lastConfirmedOn, place.timezone))}`;
	}
</script>

{#snippet backButton()}
	<a class="back round" href={backHref} onclick={onback}>
		<Icon name="back" />
		<span class="phone-only visually-hidden">{m.action_back_to_map()}</span>
		<span class="desktop-only">{m.action_back_to_list()}</span>
	</a>
{/snippet}

{#snippet shareButton()}
	<button class="round" type="button" aria-label={m.action_share()} onclick={share}>
		<Icon name="share" />
	</button>
{/snippet}

{#snippet hoursAndAddress()}
	{#if week}
		<section class="block">
			<h2>{m.place_hours()}</h2>
			<WeekHours {week} timezone={place.timezone} />
		</section>
	{/if}
	{#if place.address}
		<section class="block">
			<h2>{m.place_address()}</h2>
			<p class="address">
				<span class="glyph"><Icon name="pin" /></span>
				{place.address}{place.neighborhood ? ` · ${place.neighborhood}` : ''}
			</p>
		</section>
	{/if}
	{#if smallMap}
		<div class="small-map">
			<CityMap
				center={place.point}
				zoom={16}
				selected={toFeature(place)}
				{user}
				interactive={false}
				insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
			/>
		</div>
	{/if}
{/snippet}

{#snippet footer()}
	<div class="footer">
		<!-- TODO(feature 9): report a problem. -->
		<button class="report" type="button" aria-disabled="true">
			<Icon name="flag" />{m.action_report_problem()}
		</button>
		{#if osmUrl}
			<a class="osm-credit" href={osmUrl} target="_blank" rel="noopener">{m.place_osm_data()}</a>
		{:else}
			<span class="osm-credit">{m.place_osm_data()}</span>
		{/if}
	</div>
{/snippet}

<article class="place" class:unchecked>
	{#if unchecked}
		<div class="top-row">
			{@render backButton()}
			{@render shareButton()}
		</div>
	{:else}
		<div class="hero" class:certified>
			<PhotoGallery
				photos={place.photos ?? []}
				amenity={place.amenity}
				name={place.name}
				variant="hero"
			/>
			<div class="hero-buttons">
				{@render backButton()}
				{@render shareButton()}
			</div>
		</div>
	{/if}

	<div class="body">
		<header class="head">
			{#if certified}
				<!-- TODO(feature 10): link to /about ("How certification works"). -->
				<button
					class="cert"
					type="button"
					aria-disabled="true"
					title={m.place_how_certification_works()}
				>
					<span class="seal"><Icon name="check" /></span>
					<span class="label crema">{m.common_certified()}</span>
					<span class="info"><Icon name="info" /></span>
				</button>
				{#if origin}
					<span class="mono origin">{origin}</span>
				{/if}
			{:else}
				<span class="label">
					{removed ?? (unchecked ? m.place_level_unchecked() : m.place_level_community())}
				</span>
			{/if}
			<h1>{place.name}</h1>
			{#if meta.length}
				<span class="meta">{meta.join(' · ')}</span>
			{/if}
			{#if place.hasScore && place.scorePct !== null}
				<span class="score">
					<Icon name="thumb" />
					{m.place_score({ percent: formatPercent(place.scorePct / 100) })}
					<span class="mono">· {m.place_votes({ count: place.votes })}</span>
				</span>
			{:else if place.votes}
				<span class="score few">
					<Icon name="thumb" />
					{m.place_score_few_long({ yes: place.yesVotes, total: place.votes })}
				</span>
			{/if}
		</header>

		{#if place.mayHaveClosed}
			<div class="closed" role="note">
				<span class="glyph"><Icon name="info" /></span>
				<div>
					<strong>{m.place_may_have_closed()}</strong>
					<span>{m.place_may_have_closed_body()}</span>
				</div>
			</div>
		{/if}

		{#if unchecked}
			<section class="card">
				<h2 class="card-title">{m.place_unchecked_title()}</h2>
				<p class="card-body">{m.place_unchecked_body()}</p>
				<ul class="questions">
					<li>
						<span class="glyph"><Icon name="wifi" /></span>
						<span class="grow">{m.place_attribute_wifi()}</span>
						{#if wifiFromOsm}
							<span class="mono">
								{wifiFromOsm === 'yes' ? m.place_osm_wifi_yes() : m.place_osm_wifi_no()}
								· {m.place_unconfirmed()}
							</span>
						{:else}
							<span class="dash">—</span>
						{/if}
					</li>
					<li>
						<span class="glyph"><Icon name="outlets" /></span>
						<span class="grow">{m.place_attribute_outlets()}</span><span class="dash">—</span>
					</li>
					<li>
						<span class="glyph"><Icon name="noise" /></span>
						<span class="grow">{m.place_attribute_noise()}</span><span class="dash">—</span>
					</li>
					<li>
						<span class="glyph"><Icon name="clock" /></span>
						<span class="grow">{m.place_attribute_long_stays()}</span><span class="dash">—</span>
					</li>
				</ul>
				<a class="primary" href={updateHref}>{m.action_add_experience()}</a>
			</section>

			{@render hoursAndAddress()}

			<a class="text-link" href={directionsUrl(place.point)} target="_blank" rel="noopener">
				<Icon name="directions" />{m.action_directions()}
			</a>
			{@render footer()}
		{:else}
			<div class="tiles">
				{#each tiles as tile (tile.key)}
					<AttributeTile
						icon={tile.icon}
						name={tile.name}
						value={tile.value}
						confirmations={tile.confirmations}
						lastConfirmedOn={tile.lastConfirmedOn}
						teamMonth={tile.teamMonth}
						timezone={place.timezone}
						addHref={updateHref}
					/>
				{/each}
			</div>

			{#each place.laptopRules as rule (rule.rule)}
				<div class="rule">
					<span class="glyph"><Icon name="laptop" /></span>
					<div>
						<strong>{laptopRuleLabel(rule.rule, rule.hours)}</strong>
						<span class="mono">
							{m.place_laptop_policy()} · {provenanceLabel(rule)}
						</span>
					</div>
				</div>
			{/each}

			{#if place.extras.length}
				<section class="block">
					<h2>{m.place_more_details()}</h2>
					<ul class="extras">
						{#each place.extras as extra (extra.extra)}
							<li>
								<strong>{EXTRAS[extra.extra]()}</strong>
								<span class="mono">{provenanceLabel(extra)}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if place.notes?.length}
				<section class="block">
					<h2>{m.place_notes()}</h2>
					<ul class="notes">
						{#each place.notes as note, index (index)}
							<li>
								<p>{note.note}</p>
								<span class="mono">
									{note.fromTeam
										? fromTeamLabel(note.month)
										: formatDate(`${note.month}-01`, {
												month: 'short',
												year: 'numeric',
												timeZone: 'UTC'
											})}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if sharedBy}
				<p class="shared-by">{sharedBy}</p>
			{/if}

			{#if !certified && place.canGetCertified}
				<CertificationProgress contributors={place.contributors} minUsers={place.minUsers} hint />
			{/if}

			{@render hoursAndAddress()}
			{@render footer()}
		{/if}
	</div>

	{#if !unchecked}
		<div class="actions">
			<a class="primary" href="{updateHref}?checkin=1">{m.action_check_in_here()}</a>
			<a
				class="directions"
				href={directionsUrl(place.point)}
				target="_blank"
				rel="noopener"
				aria-label={m.action_directions()}
			>
				<Icon name="directions" />
			</a>
		</div>
	{/if}

	{#if notice}
		<p class="notice" role="status">{notice}</p>
	{/if}
</article>

<style>
	.place {
		position: relative;
		min-height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}

	.hero {
		position: relative;
		height: 240px;
		flex-shrink: 0;
	}

	.hero.certified {
		height: 300px;
	}

	.hero-buttons,
	.top-row {
		display: flex;
		justify-content: space-between;
		padding: 16px;
	}

	.hero-buttons {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		pointer-events: none;
	}

	.hero-buttons > :global(*) {
		pointer-events: auto;
	}

	.round {
		height: var(--tap);
		min-width: var(--tap);
		border: 0;
		border-radius: 22px;
		background: var(--surface);
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		box-shadow: 0 2px 8px var(--sh-4);
		text-decoration: none;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}

	.desktop-only {
		display: none;
	}

	.body {
		position: relative;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 24px 20px 24px;
		background: var(--bg);
	}

	.hero + .body {
		margin-top: -28px;
		border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
	}

	.unchecked .body {
		padding-top: 0;
		gap: 22px;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.cert {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0;
		border: 0;
		background: none;
		cursor: default;
	}

	.seal {
		width: 20px;
		height: 20px;
		border-radius: 10px;
	}

	.seal :global(.icon) {
		width: 12px;
		height: 12px;
		stroke-width: 3;
	}

	.label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.label.crema {
		color: var(--icon);
	}

	.info {
		display: flex;
		color: var(--muted);
	}

	.info :global(.icon) {
		width: 14px;
		height: 14px;
	}

	.origin {
		margin-top: -4px;
	}

	h1 {
		margin: 0;
		font-size: 31px;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.05;
	}

	.meta {
		font-size: 14px;
		color: var(--muted);
	}

	.score {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 700;
	}

	.score.few {
		font-weight: 600;
	}

	.score :global(.icon) {
		width: 18px;
		height: 18px;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 400;
		color: var(--muted);
	}

	.glyph {
		display: flex;
		color: var(--icon);
		flex-shrink: 0;
	}

	.closed {
		display: flex;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 18px;
		background: var(--pill);
	}

	.closed .glyph {
		color: var(--danger);
	}

	.closed div,
	.rule div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 14px;
	}

	.closed span {
		color: var(--muted);
		line-height: 1.45;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	/* Laptop rules: Roast outline, as in the list (crema is for the certified seal only). */
	.rule {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 14px 16px;
		border-radius: 18px;
		border: 1.5px solid var(--muted);
	}

	.extras,
	.notes {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	.extras li,
	.notes li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
		font-size: 15px;
	}

	.notes p {
		margin: 0;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}

	.shared-by {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 20px;
		border-radius: 22px;
		background: var(--surface);
		box-shadow: 0 1px 3px var(--sh-4);
	}

	.card-title {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.card-body {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--muted);
	}

	.questions {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.questions li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 0;
		border-top: 1px solid var(--line);
		font-size: 15px;
	}

	.grow {
		flex-grow: 1;
	}

	.dash {
		color: var(--muted);
	}

	.primary {
		min-height: var(--btn-height);
		padding: 0 16px;
		border-radius: var(--radius);
		background: var(--btn);
		color: var(--btnfg);
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		text-decoration: none;
		font-size: 16px;
		font-weight: 700;
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.block h2 {
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.address {
		margin: 0;
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-size: 15px;
		line-height: 1.4;
	}

	.small-map {
		position: relative;
		height: 180px;
		border-radius: var(--radius);
		overflow: hidden;
		--attribution-bottom: 6px;
	}

	.text-link {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--tap);
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
	}

	.footer {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.report {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		font-size: 15px;
		color: var(--muted);
		cursor: default;
	}

	.osm-credit {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--muted);
		text-decoration: none;
	}

	.actions {
		position: sticky;
		bottom: 0;
		display: flex;
		gap: 10px;
		padding: 14px 20px calc(14px + env(safe-area-inset-bottom));
		background: var(--bg);
		border-top: 1px solid var(--line);
		z-index: 2;
	}

	.actions .primary {
		flex-grow: 1;
	}

	.directions {
		width: var(--btn-height);
		height: var(--btn-height);
		flex-shrink: 0;
		border-radius: var(--radius);
		background: var(--pill);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.notice {
		position: fixed;
		left: 50%;
		bottom: 96px;
		transform: translateX(-50%);
		margin: 0;
		padding: 12px 16px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-size: 14px;
		box-shadow: 0 3px 12px var(--sh-4);
		z-index: 30;
	}

	@media (min-width: 1024px) {
		.phone-only {
			display: none;
		}

		.desktop-only {
			display: inline;
		}

		.back {
			padding: 0 14px 0 10px;
		}

		.body {
			padding: 24px 24px 24px;
		}
	}
</style>
