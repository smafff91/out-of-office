<script lang="ts">
	// "Show my location" floating button (LatteHome), placed with the --bottom CSS variable.
	import * as m from '#lib/paraglide/messages.js';

	let { busy = false, onclick }: { busy?: boolean; onclick: () => void } = $props();
</script>

<button
	class="locate"
	type="button"
	aria-label={m.action_show_my_location()}
	aria-busy={busy}
	disabled={busy}
	{onclick}
>
	<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
		><path d="M3 11l18-8-8 18-2-8z"></path></svg
	>
</button>

<style>
	.locate {
		position: absolute;
		right: var(--gutter);
		bottom: var(--bottom, 24px);
		width: 48px;
		height: 48px;
		border: 0;
		border-radius: 14px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 3px 12px var(--sh-4);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.locate:disabled {
		cursor: progress;
		color: var(--muted);
	}
</style>
