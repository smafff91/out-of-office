<script lang="ts">
	// "2 of 10 users to get certified · 8 to go" (LattePlaceCommunity), on the place page and on
	// the thanks screen after an update (LatteThanks). Places not certified yet only.
	import * as m from '#lib/paraglide/messages.js';

	type Props = {
		contributors: number;
		minUsers: number;
		/** "Check in to help it get certified." under the bar. */
		hint?: boolean;
	};

	let { contributors, minUsers, hint = false }: Props = $props();

	const toGo = $derived(Math.max(0, minUsers - contributors));
	const progress = $derived(Math.min(1, contributors / Math.max(1, minUsers)));
</script>

<div class="progress">
	<div class="progress-head">
		<strong>
			{m.place_certification_progress({ count: contributors, total: minUsers })}
		</strong>
		<span class="mono">{m.place_to_go({ count: toGo })}</span>
	</div>
	<div
		class="bar"
		role="progressbar"
		aria-valuemin={0}
		aria-valuemax={minUsers}
		aria-valuenow={contributors}
	>
		<span style:width="{progress * 100}%"></span>
	</div>
	{#if hint}
		<span class="hint">{m.place_check_in_hint()}</span>
	{/if}
</div>

<style>
	.progress {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: 0 1px 3px var(--sh-4);
	}

	.progress-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 14px;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
	}

	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--pill);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.hint {
		font-size: 12px;
		line-height: 1.45;
		color: var(--muted);
	}
</style>
