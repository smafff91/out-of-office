<script lang="ts">
	// Certified filter with no certified place in view (LatteNoResults).
	import * as m from '#lib/paraglide/messages.js';

	type Props = {
		/** Places in view that nobody has checked yet. */
		unchecked: number;
		onshowall: () => void;
		/** Undefined when the city has no certified place at all. */
		onzoomout?: () => void;
	};

	let { unchecked, onshowall, onzoomout }: Props = $props();
</script>

<div class="empty" role="status">
	<div class="text">
		<h3>{m.certified_none_title()}</h3>
		{#if unchecked > 0}
			<p>{m.certified_none_body({ count: unchecked })}</p>
		{/if}
	</div>
	<button class="primary" type="button" onclick={onshowall}>{m.action_show_all()}</button>
	{#if onzoomout}
		<button class="secondary" type="button" onclick={onzoomout}>
			{m.action_zoom_out_certified()}
		</button>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 8px 0 4px;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-bottom: 6px;
	}

	h3 {
		margin: 0;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: var(--tracking-title);
	}

	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
	}

	button {
		height: var(--btn-height);
		border: 0;
		border-radius: var(--radius);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.primary {
		background: var(--btn);
		color: var(--btnfg);
	}

	.secondary {
		background: var(--pill);
		color: var(--ink);
	}
</style>
