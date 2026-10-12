<script lang="ts">
	// Nearest / Top rated (LatteList segmented control).
	import * as m from '#lib/paraglide/messages.js';
	import type { Sort } from '#lib/places/list.ts';

	let { sort, onchange }: { sort: Sort; onchange: (sort: Sort) => void } = $props();

	const options: [Sort, () => string][] = [
		['nearest', m.sort_nearest],
		['top', m.sort_top_rated]
	];
</script>

<div class="segmented" role="group" aria-label={m.sort_label()}>
	{#each options as [value, label] (value)}
		<button
			type="button"
			class="tap-target"
			aria-pressed={sort === value}
			onclick={() => onchange(value)}
		>
			{label()}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 12px;
		background: var(--pill);
		flex-shrink: 0;
	}

	button {
		height: 34px;
		padding: 0 12px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 3px var(--sh-3);
	}
</style>
