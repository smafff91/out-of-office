<script lang="ts">
	// The panel over the bottom of the map (LatteHome). Its height is bindable so the map
	// controls and the attribution can sit just above it.
	import type { Snippet } from 'svelte';

	type Props = { label: string; height?: number; children: Snippet };

	let { label, height = $bindable(0), children }: Props = $props();
</script>

<section class="sheet" aria-label={label} bind:clientHeight={height}>
	<div class="handle" aria-hidden="true"></div>
	{@render children()}
</section>

<style>
	.sheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: 80dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--surface);
		border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
		box-shadow: 0 -6px 24px var(--sh-4);
		padding: 10px 20px calc(20px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* A tall sheet scrolls instead of squeezing its content. */
	.sheet > :global(*) {
		flex-shrink: 0;
	}

	.handle {
		align-self: center;
		width: 44px;
		height: 5px;
		border-radius: 3px;
		background: var(--line);
	}

	@media (min-width: 768px) {
		.sheet {
			left: var(--gutter);
			bottom: var(--gutter);
			width: 480px;
			border-radius: var(--radius-sheet);
			padding-bottom: 20px;
		}
	}
</style>
