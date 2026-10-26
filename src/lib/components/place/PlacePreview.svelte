<script lang="ts">
	// Card shown over the map when a pin or a row is tapped on phones (LattePreview,
	// LattePreviewUnverified). The name shows at once; the rest when the details arrive.
	import { formatDaysAgo } from '#lib/i18n/format.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { PlaceLevel } from '#lib/map/index.ts';
	import { daysSince } from '#lib/places/dates.ts';
	import { directionsUrl } from '#lib/platform/directions.ts';
	import type { PlaceDetail } from '#lib/supabase/place-details.ts';
	import { publicPhotoUrl } from '#lib/supabase/photos.ts';
	import type { PlacePhoto } from '#lib/places/photos.ts';
	import Icon from './Icon.svelte';
	import PhotoGallery from './PhotoGallery.svelte';
	import { ATTRIBUTE_PILLS, distanceLabel, openingLabel, osmWifi } from './labels.ts';
	import type { IconName } from './icons.ts';

	type Props = {
		name: string;
		level: PlaceLevel;
		/** Undefined while loading. */
		place?: PlaceDetail;
		/** Meters from the user's real position, when known. */
		distance?: number;
		href: string;
		onopen: () => void;
		onclose: () => void;
	};

	let { name, level, place, distance, href, onopen, onclose }: Props = $props();

	const unchecked = $derived(level === 'osm_only');

	/** The three latest thumbnails (the first one is the cover); credits only on the place page. */
	const photos = $derived(
		(place?.photoPaths ?? []).flatMap((path): PlacePhoto[] => {
			const thumbUrl = publicPhotoUrl('thumb', path);
			return thumbUrl ? [{ url: thumbUrl, thumbUrl }] : [];
		})
	);

	const meta = $derived(
		[
			unchecked && place?.amenity
				? place.amenity === 'bar'
					? m.place_kind_bar()
					: m.place_kind_cafe()
				: undefined,
			distance !== undefined ? distanceLabel(distance) : undefined,
			unchecked ? undefined : place?.neighborhood,
			place ? openingLabel(place.openingHours, place.timezone) : undefined
		].filter(Boolean)
	);

	const pills = $derived.by(() => {
		if (!place) return [];
		const { wifi, outlets, noise, long_stays } = place.attributes;
		const list: { icon: IconName; text: string }[] = [];
		if (wifi) list.push({ icon: 'wifi', text: ATTRIBUTE_PILLS.wifi[wifi.value]() });
		if (outlets) list.push({ icon: 'outlets', text: ATTRIBUTE_PILLS.outlets[outlets.value]() });
		if (noise) list.push({ icon: 'noise', text: ATTRIBUTE_PILLS.noise[noise.value]() });
		if (long_stays) {
			list.push({ icon: 'clock', text: ATTRIBUTE_PILLS.long_stays[long_stays.value]() });
		}
		return list;
	});

	/** "Confirmed by 4 users · last 3 days ago": the latest confirmation of any attribute. */
	const confirmed = $derived.by(() => {
		if (!place?.contributors) return undefined;
		const days = Object.values(place.attributes)
			.map((attribute) => attribute?.lastConfirmedOn)
			.filter((day): day is string => !!day)
			.sort()
			.at(-1);
		if (!days) return undefined;
		return m.preview_confirmed_last({
			count: place.contributors,
			ago: formatDaysAgo(daysSince(days, place.timezone))
		});
	});

	const wifiFromOsm = $derived(place ? osmWifi(place.internetAccessOsm) : undefined);

	function open(event: MouseEvent) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}
		event.preventDefault();
		onopen();
	}
</script>

<div class="preview">
	{#if !unchecked}
		<PhotoGallery
			{photos}
			total={place?.photoCount}
			amenity={place?.amenity ?? null}
			{name}
			variant="strip"
		/>
	{/if}

	<div class="head">
		<div class="title">
			{#if unchecked}
				<span class="label">{m.place_level_unchecked()}</span>
			{/if}
			<div class="name-row">
				<h2>{name}</h2>
				{#if level === 'certified'}
					<span class="seal" title={m.common_certified()}>
						<Icon name="check" />
						<span class="visually-hidden">{m.common_certified()}</span>
					</span>
				{/if}
			</div>
			{#if meta.length}
				<span class="meta">{meta.join(' · ')}</span>
			{/if}
		</div>
		<button class="close" type="button" aria-label={m.action_close()} onclick={onclose}>
			<Icon name="close" />
		</button>
	</div>

	{#if !place}
		<span class="skeleton" aria-hidden="true"></span>
	{:else if unchecked}
		{#if wifiFromOsm}
			<div class="osm">
				<span class="glyph"><Icon name="wifi" /></span>
				<span class="grow"
					>{wifiFromOsm === 'yes' ? m.place_osm_wifi_yes() : m.place_osm_wifi_no()}</span
				>
				<span class="mono">{m.place_unconfirmed()}</span>
			</div>
		{/if}
		<div class="invite">
			<strong>{m.preview_be_first()}</strong>
			<span>{m.preview_be_first_body()}</span>
		</div>
		<!-- "I'm here": opens the form as a check-in (asks for the position). -->
		<a class="primary" href="{href}/update?checkin=1">{m.action_add_work_info_here()}</a>
	{:else}
		{#if pills.length}
			<ul class="pills">
				{#each pills as pill (pill.icon)}
					<li><span class="glyph"><Icon name={pill.icon} /></span>{pill.text}</li>
				{/each}
			</ul>
		{/if}
		{#if confirmed}
			<span class="mono">{confirmed}</span>
		{/if}
	{/if}

	<div class="actions" class:secondary={unchecked}>
		<a class="open" {href} onclick={open}>
			{unchecked ? m.action_see_place() : m.action_see_details()}
		</a>
		{#if place}
			<a
				class="directions"
				href={directionsUrl(place.point)}
				target="_blank"
				rel="noopener"
				aria-label={m.action_directions()}
			>
				<Icon name="directions" />
			</a>
		{/if}
	</div>
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.title {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	h2 {
		margin: 0;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: var(--tracking-title);
		line-height: 1.1;
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

	.meta {
		font-size: 14px;
		color: var(--muted);
	}

	.close {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border: 0;
		border-radius: 18px;
		background: var(--pill);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.close :global(.icon) {
		width: 16px;
		height: 16px;
	}

	.pills {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.pills li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 11px 12px;
		border-radius: 12px;
		background: var(--pill);
		font-size: 14px;
		font-weight: 600;
	}

	.glyph {
		display: flex;
		color: var(--icon);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
	}

	.osm {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 0;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		font-size: 15px;
	}

	.grow {
		flex-grow: 1;
	}

	.invite {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.invite strong {
		font-size: 17px;
		font-weight: 700;
	}

	.invite span {
		font-size: 14px;
		line-height: 1.5;
		color: var(--muted);
	}

	.primary,
	.open {
		height: var(--btn-height);
		border: 0;
		border-radius: var(--radius);
		background: var(--btn);
		color: var(--btnfg);
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		font-size: 16px;
		font-weight: 700;
	}

	.actions {
		display: flex;
		gap: 10px;
	}

	.open {
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

	/* Not checked yet: the contribution button leads, "See place" is secondary (Foam). */
	.secondary .open {
		height: 50px;
		border-radius: 14px;
		background: var(--pill);
		color: var(--ink);
		font-size: 15px;
		font-weight: 600;
	}

	.secondary .directions {
		width: 50px;
		height: 50px;
		border-radius: 14px;
	}

	.skeleton {
		height: 96px;
		border-radius: var(--radius);
		background: var(--pill);
	}
</style>
