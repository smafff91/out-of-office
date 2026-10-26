<script lang="ts">
	// Where the user is, at the top of the form (LatteContribute). Crema only for a check-in
	// that looks verified; every other state is a neutral Foam box. Only a preview: the
	// database decides from a fresh position read when the update is sent.
	import type { CheckinView } from '#lib/contribute/checkin.ts';
	import Icon from '#lib/components/place/Icon.svelte';
	import { formatKilometers, formatMeters } from '#lib/i18n/format.ts';
	import * as m from '#lib/paraglide/messages.js';

	let { view, onlocate }: { view: CheckinView; onlocate: () => void } = $props();

	const distance = (meters: number) =>
		meters < 1000 ? formatMeters(meters) : formatKilometers(meters / 1000);
</script>

<div class="box" class:here={view.state === 'here'} role="status">
	<span class="dot"><Icon name="pin" /></span>
	<div class="text">
		{#if view.state === 'here'}
			<strong>{m.contribute_checkin_verified()}</strong>
			<span class="mono">{m.contribute_checkin_distance({ distance: distance(view.meters) })}</span>
		{:else if view.state === 'locating'}
			<span>{m.contribute_checkin_locating()}</span>
		{:else if view.state === 'far'}
			<span>{m.contribute_checkin_far({ distance: distance(view.meters) })}</span>
		{:else if view.state === 'imprecise'}
			<span>{m.contribute_checkin_imprecise()}</span>
			<button type="button" class="link tap-target" onclick={onlocate}
				>{m.action_try_again()}</button
			>
		{:else if view.state === 'unavailable'}
			<span>{m.contribute_checkin_unavailable()}</span>
			<button type="button" class="link tap-target" onclick={onlocate}
				>{m.action_try_again()}</button
			>
		{:else}
			<strong>{m.contribute_checkin_idle_title()}</strong>
			<span>{m.contribute_checkin_idle_body()}</span>
			<button type="button" class="here-now" onclick={onlocate}>{m.action_im_here_now()}</button>
		{/if}
	</div>
</div>

<style>
	.box {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px 16px;
		border-radius: var(--radius);
		background: var(--pill);
	}

	.box.here {
		align-items: center;
		background: var(--surface);
		box-shadow: 0 1px 3px var(--sh-4);
	}

	.dot {
		width: 36px;
		height: 36px;
		border-radius: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		color: var(--muted);
	}

	.here .dot {
		background: var(--accent);
		color: var(--ink);
	}

	.dot :global(.icon) {
		width: 18px;
		height: 18px;
	}

	.here .dot :global(.icon) {
		stroke-width: 2.4;
	}

	.text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		min-width: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--muted);
	}

	.text strong {
		font-size: 15px;
		color: var(--ink);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 11px;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 14px;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}

	.here-now {
		margin-top: 8px;
		min-height: var(--tap);
		padding: 0 16px;
		border: 1.5px solid var(--ink);
		border-radius: 14px;
		background: var(--surface);
		color: var(--ink);
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
	}
</style>
