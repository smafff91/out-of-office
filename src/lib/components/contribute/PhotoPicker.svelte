<script lang="ts">
	// "Photos" in the contribution form (LatteContribute): a grid of three, "Add photo" until the
	// third, a × on each thumbnail. Photos are compressed as soon as they are chosen (two WebP
	// files without metadata, src/lib/photos/compress.ts); the form keeps them and uploads them
	// after the contribution is saved. Under the grid: the hint and what sending confirms.
	import { onDestroy } from 'svelte';
	import { PHOTOS_PER_CONTRIBUTION, PHOTOS_PER_USER_PLACE } from '#lib/config.ts';
	import Icon from '#lib/components/place/Icon.svelte';
	import { formatNumber } from '#lib/i18n/format.ts';
	import * as m from '#lib/paraglide/messages.js';
	import {
		UnreadablePhotoError,
		compressPhoto,
		prepareEncoder,
		type CompressedPhoto
	} from '#lib/photos/compress.ts';
	import { pickPhotos } from '#lib/platform/photos.ts';

	type Props = {
		labelledby: string;
		photos: CompressedPhoto[];
		onadd: (photo: CompressedPhoto) => void;
		onremove: (id: string) => void;
		/** The user's visible photos already in this place (0 when signed out). */
		myPhotosHere?: number;
		/** A message from the form (e.g. photos that could not be kept across a reload). */
		notice?: string;
	};

	let { labelledby, photos, onadd, onremove, myPhotosHere = 0, notice }: Props = $props();

	const uid = $props.id();
	let preparing = $state(0);
	let error = $state<'unreadable' | 'too_many' | 'failed'>();

	const free = $derived(PHOTOS_PER_CONTRIBUTION - photos.length - preparing);
	/** Only when something will really go: older photos here plus these beyond the limit. */
	const replacesOlder = $derived(
		myPhotosHere > 0 && myPhotosHere + photos.length > PHOTOS_PER_USER_PLACE
	);
	/** Empty tiles after "Add photo", so the grid always shows three places. */
	const placeholders = $derived(Math.max(0, free - 1));

	// Thumbnails as object URLs, freed when a photo goes.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a cache of URLs, not state.
	const urls = new Map<string, string>();
	function thumbUrl(photo: CompressedPhoto) {
		let url = urls.get(photo.id);
		if (!url) {
			url = URL.createObjectURL(photo.thumb);
			urls.set(photo.id, url);
		}
		return url;
	}
	$effect(() => {
		const ids = new Set(photos.map((photo) => photo.id));
		for (const [id, url] of urls) {
			if (!ids.has(id)) {
				URL.revokeObjectURL(url);
				urls.delete(id);
			}
		}
	});
	onDestroy(() => {
		for (const url of urls.values()) URL.revokeObjectURL(url);
	});

	async function add() {
		error = undefined;
		// Before the picker opens: on Safari the WebP encoder downloads while the user chooses.
		prepareEncoder();
		const room = free;
		const files = await pickPhotos({ max: room });
		if (files.length > room) error = 'too_many';
		for (const file of files.slice(0, room)) {
			preparing++;
			try {
				onadd(await compressPhoto(file));
			} catch (err) {
				error = err instanceof UnreadablePhotoError ? 'unreadable' : 'failed';
			} finally {
				preparing--;
			}
		}
	}

	function remove(photo: CompressedPhoto, number: number) {
		onremove(photo.id);
		error = undefined;
		// Focus stays in the grid: the next × or "Add photo".
		queueMicrotask(() => {
			const grid = document.getElementById(`${uid}-grid`);
			const next =
				grid?.querySelectorAll<HTMLButtonElement>('button.remove')[number - 1] ??
				grid?.querySelector<HTMLButtonElement>('button.add');
			next?.focus();
		});
	}

	const ERRORS = {
		unreadable: m.contribute_photo_unreadable,
		failed: m.contribute_photo_unreadable,
		too_many: () => m.contribute_photos_too_many({ count: formatNumber(PHOTOS_PER_CONTRIBUTION) })
	};
</script>

<div class="grid" id="{uid}-grid" role="group" aria-labelledby={labelledby}>
	{#each photos as photo, i (photo.id)}
		<div class="tile">
			<img src={thumbUrl(photo)} alt={m.contribute_photo_alt({ number: formatNumber(i + 1) })} />
			<button
				class="remove tap-target"
				type="button"
				aria-label={m.contribute_photo_remove({ number: formatNumber(i + 1) })}
				onclick={() => remove(photo, i + 1)}
			>
				<Icon name="close" />
			</button>
		</div>
	{/each}
	{#each { length: preparing }, i (i)}
		<div class="tile preparing" role="status">
			<span>{m.contribute_photo_preparing()}</span>
		</div>
	{/each}
	{#if free > 0}
		<button class="add" type="button" onclick={() => void add()}>
			<Icon name="camera" />
			{m.contribute_add_photo()}
		</button>
		{#each { length: placeholders }, i (i)}
			<div class="tile empty" aria-hidden="true"></div>
		{/each}
	{/if}
</div>

{#if error || notice}
	<p class="error" role="alert">{error ? ERRORS[error]() : notice}</p>
{/if}
{#if replacesOlder}
	<p class="hint">{m.contribute_photos_replace()}</p>
{/if}
<p class="hint">{m.contribute_photos_hint()}</p>
<p class="hint">{m.contribute_photos_terms()}</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.tile,
	.add {
		position: relative;
		aspect-ratio: 1;
		border-radius: var(--radius);
	}

	.tile {
		background: var(--pill);
	}

	.tile img {
		width: 100%;
		height: 100%;
		border-radius: inherit;
		object-fit: cover;
		display: block;
	}

	.preparing {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 8px;
		font-size: 12px;
		text-align: center;
		color: var(--muted);
	}

	.add {
		border: 1.5px dashed var(--accent);
		background: var(--surface);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 4px;
		font: 600 12px var(--font-sans);
		color: var(--ink);
		cursor: pointer;
	}

	.add :global(.icon) {
		color: var(--icon);
	}

	.remove {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: 14px;
		background: rgba(31, 23, 18, 0.7);
		color: var(--bg);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.remove :global(.icon) {
		width: 16px;
		height: 16px;
		stroke-width: 2.2;
	}

	.hint,
	.error {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
	}

	.hint {
		color: var(--muted);
	}

	.error {
		color: var(--danger);
	}
</style>
