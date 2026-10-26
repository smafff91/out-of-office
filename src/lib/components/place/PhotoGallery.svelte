<script lang="ts">
	// Place photos, whatever their source: "Photo by {name}" when the author chose to show their
	// name, nothing otherwise (never a date). With no photos, a placeholder with the kind of
	// place. The strip uses the 400 px versions. No links out to other apps or sites.
	import * as m from '#lib/paraglide/messages.js';
	import { formatNumber } from '#lib/i18n/format.ts';
	import type { PlacePhoto } from '#lib/places/photos.ts';
	import AmenityIcon from './AmenityIcon.svelte';

	type Props = {
		photos: PlacePhoto[];
		amenity: 'cafe' | 'bar' | null;
		name: string;
		/** 'hero': top of the place page; 'strip': three tiles in the preview. */
		variant: 'hero' | 'strip';
		/** How many photos the place has (the strip gets only three): "+N" on the third tile. */
		total?: number;
		/** Not checked yet: a dashed placeholder (like the list rows). */
		muted?: boolean;
	};

	let { photos, amenity, name, variant, muted = false, total = photos.length }: Props = $props();

	let index = $state(0);
	let scroller = $state<HTMLElement>();

	function onscroll() {
		if (!scroller) return;
		index = Math.round(scroller.scrollLeft / scroller.clientWidth);
	}
</script>

{#if photos.length === 0}
	<div class="placeholder {variant}" class:muted aria-hidden="true">
		<span class="kind"><AmenityIcon {amenity} /></span>
	</div>
{:else if variant === 'strip'}
	<div class="strip">
		{#each photos.slice(0, 3) as photo, i (photo.url)}
			<figure>
				<img src={photo.thumbUrl} alt={name} loading="lazy" />
				{#if i === 2 && total > 3}
					<span class="more">+{formatNumber(total - 3)}</span>
				{/if}
			</figure>
		{/each}
	</div>
{:else}
	<div class="hero-photos">
		<div class="scroller" bind:this={scroller} {onscroll}>
			{#each photos as photo, i (photo.url)}
				<figure>
					<img
						src={photo.url}
						alt={name}
						loading={i === 0 ? 'eager' : 'lazy'}
						width={photo.width}
						height={photo.height}
					/>
					{#if photo.author}
						<figcaption>{m.place_photo_by({ name: photo.author })}</figcaption>
					{/if}
				</figure>
			{/each}
		</div>
		{#if photos.length > 1}
			<span class="count">{index + 1} / {photos.length}</span>
		{/if}
	</div>
{/if}

<style>
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--photo);
		color: var(--icon);
	}

	.placeholder.muted {
		background: var(--pill);
		color: var(--dot);
	}

	.placeholder.hero {
		height: 100%;
	}

	.placeholder.strip {
		height: 104px;
		border-radius: var(--radius);
	}

	.kind :global(.icon) {
		width: 40px;
		height: 40px;
		stroke-width: 1.4;
	}

	.strip {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 6px;
	}

	.strip figure {
		position: relative;
		height: 104px;
		margin: 0;
		border-radius: 6px;
		overflow: hidden;
		background: var(--photo);
	}

	.strip figure:first-child {
		border-radius: var(--radius) 6px 6px var(--radius);
	}

	.strip figure:last-child {
		border-radius: 6px var(--radius) var(--radius) 6px;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.more {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(31, 23, 18, 0.35);
		color: var(--bg);
		font-size: 13px;
		font-weight: 600;
	}

	.hero-photos {
		position: relative;
		height: 100%;
	}

	.scroller {
		display: flex;
		height: 100%;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	.scroller figure {
		position: relative;
		flex: 0 0 100%;
		margin: 0;
		scroll-snap-align: start;
		background: var(--photo);
	}

	figcaption {
		position: absolute;
		left: 12px;
		bottom: 40px;
		max-width: calc(100% - 100px);
		padding: 3px 8px;
		border-radius: 8px;
		background: rgba(31, 23, 18, 0.6);
		color: var(--bg);
		font-size: 11px;
		line-height: 1.4;
	}

	.count {
		position: absolute;
		right: 16px;
		bottom: 40px;
		padding: 4px 9px;
		border-radius: 10px;
		background: rgba(31, 23, 18, 0.7);
		color: var(--bg);
		font-family: var(--font-mono);
		font-size: 11px;
	}
</style>
