<script lang="ts">
	// Desktop top bar (LatteDesktop): app name, city, search, Certified filter, add a place,
	// sign in. Shown from 1024px wide.
	import type { Snippet } from 'svelte';
	import { APP_NAME } from '#lib/config.ts';
	import * as m from '#lib/paraglide/messages.js';
	import CertifiedChip from './CertifiedChip.svelte';

	type Props = {
		city: string;
		certifiedOnly: boolean;
		ontogglecertified: () => void;
		/** The inline search box. */
		search: Snippet;
	};

	let { city, certifiedOnly, ontogglecertified, search }: Props = $props();
</script>

<header class="bar">
	<span class="app">{APP_NAME}</span>
	<!-- One open city for now: a label. A city switcher comes with the second city. -->
	<span class="city">{city}</span>
	{@render search()}
	<CertifiedChip on={certifiedOnly} ontoggle={ontogglecertified} variant="flat" />
	<span class="spacer"></span>
	<!-- TODO(feature 10): /add. -->
	<button class="link" type="button" aria-disabled="true">{m.action_add_place()}</button>
	<!-- TODO(feature 7): sign in. -->
	<button class="sign-in" type="button" aria-disabled="true">{m.action_sign_in()}</button>
</header>

<style>
	.bar {
		display: none;
	}

	@media (min-width: 1024px) {
		.bar {
			grid-column: 1 / -1;
			height: 76px;
			display: flex;
			align-items: center;
			gap: 16px;
			padding: 0 24px;
			border-bottom: 1px solid var(--line);
			background: var(--surface);
			position: relative;
			z-index: 10;
		}
	}

	.app {
		width: 170px;
		flex-shrink: 0;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.city {
		height: 48px;
		padding: 0 16px;
		border-radius: 14px;
		background: var(--pill);
		display: flex;
		align-items: center;
		font-size: 15px;
		font-weight: 700;
	}

	.spacer {
		flex-grow: 1;
	}

	.link {
		border: 0;
		background: none;
		font-size: 15px;
		font-weight: 600;
		cursor: default;
	}

	.sign-in {
		height: 44px;
		padding: 0 18px;
		border: 0;
		border-radius: 12px;
		background: var(--btn);
		color: var(--btnfg);
		font-size: 15px;
		font-weight: 700;
		cursor: default;
	}
</style>
