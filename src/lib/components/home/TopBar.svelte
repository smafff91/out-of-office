<script lang="ts">
	// Phone top bar (LatteHome): search, account, Certified filter. Hidden from 1024px wide,
	// where DesktopBar takes over.
	import AccountButton from '#lib/components/account/AccountButton.svelte';
	import * as m from '#lib/paraglide/messages.js';
	import CertifiedChip from './CertifiedChip.svelte';

	type Props = {
		certifiedOnly: boolean;
		/** The list covers the whole screen: the bar gets a solid background (LatteList). */
		solid: boolean;
		height?: number;
		onsearch: () => void;
		ontogglecertified: () => void;
	};

	let {
		certifiedOnly,
		solid,
		height = $bindable(0),
		onsearch,
		ontogglecertified
	}: Props = $props();
</script>

<header class="top" class:solid bind:clientHeight={height}>
	<div class="row">
		<button class="search" type="button" onclick={onsearch}>
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="11" cy="11" r="7"></circle>
				<path d="M20 20l-4-4"></path>
			</svg>
			<span>{m.common_search_placeholder()}</span>
		</button>
		<AccountButton />
	</div>
	<div>
		<CertifiedChip on={certifiedOnly} ontoggle={ontogglecertified} />
	</div>
</header>

<style>
	.top {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		padding: 16px var(--gutter) 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		pointer-events: none;
		z-index: 6;
	}

	.top.solid {
		background: var(--surface);
		pointer-events: auto;
	}

	.top button {
		pointer-events: auto;
	}

	.row {
		display: flex;
		gap: 10px;
	}

	.search {
		height: 54px;
		border: 0;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 4px 16px var(--sh-4);
		display: flex;
		align-items: center;
	}

	.solid .search {
		background: var(--pill);
		box-shadow: none;
	}

	.search {
		flex-grow: 1;
		min-width: 0;
		gap: 12px;
		padding: 0 16px;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: var(--tracking-tight);
		text-align: left;
		cursor: text;
	}

	.search span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (min-width: 1024px) {
		.top {
			display: none;
		}
	}
</style>
