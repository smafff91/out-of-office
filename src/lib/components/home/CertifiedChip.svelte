<script lang="ts">
	// "Certified for remote work" filter toggle: white when off, espresso with a close mark
	// when on (LatteNoResults).
	import * as m from '#lib/paraglide/messages.js';

	type Props = { on: boolean; ontoggle: () => void; variant?: 'floating' | 'flat' };

	let { on, ontoggle, variant = 'floating' }: Props = $props();
</script>

<button class="chip {variant}" class:on type="button" aria-pressed={on} onclick={ontoggle}>
	<span class="seal" aria-hidden="true">
		<svg class="icon" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"></path></svg>
	</span>
	{m.common_certified()}
	{#if on}
		<svg class="icon close" viewBox="0 0 24 24" aria-hidden="true"
			><path d="M6 6l12 12M18 6L6 18"></path></svg
		>
	{/if}
</button>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 14px 0 10px;
		border: 0;
		border-radius: 19px;
		background: var(--surface);
		color: var(--ink);
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		pointer-events: auto;
	}

	.floating {
		box-shadow: 0 2px 8px var(--sh-4);
	}

	.flat {
		height: 40px;
		border-radius: 20px;
		border: 1px solid var(--line);
	}

	.chip.on {
		background: var(--btn);
		color: var(--btnfg);
		border-color: var(--btn);
		padding-right: 12px;
	}

	.close {
		width: 16px;
		height: 16px;
	}
</style>
