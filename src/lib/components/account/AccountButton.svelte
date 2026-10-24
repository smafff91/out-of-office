<script lang="ts">
	// The account square of the phone top bar (LatteHome): filled once signed in, with the
	// initial when there is a name. Opens the account sheet.
	import { session } from '#lib/auth/session.svelte.ts';
	import { getLocale } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import AccountSheet from './AccountSheet.svelte';

	let open = $state(false);

	const signedIn = $derived(session.status === 'signed-in');
	const name = $derived(session.profile?.displayName ?? undefined);
	const initial = $derived(name ? [...name][0].toLocaleUpperCase(getLocale()) : undefined);
</script>

<button
	class="account"
	class:signed-in={signedIn}
	type="button"
	aria-label={m.common_account()}
	aria-haspopup="dialog"
	onclick={() => (open = true)}
>
	{#if signedIn && initial}
		<span class="initial" aria-hidden="true">{initial}</span>
	{:else}
		<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="8" r="4"></circle>
			<path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path>
		</svg>
	{/if}
</button>

<AccountSheet bind:open />

<style>
	.account {
		width: 54px;
		height: 54px;
		flex-shrink: 0;
		border: 0;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 4px 16px var(--sh-4);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: auto;
		cursor: pointer;
	}

	:global(.solid) .account {
		background: var(--pill);
		box-shadow: none;
	}

	.account.signed-in,
	:global(.solid) .account.signed-in {
		background: var(--btn);
		color: var(--btnfg);
	}

	.initial {
		font-size: 18px;
		font-weight: 800;
	}
</style>
