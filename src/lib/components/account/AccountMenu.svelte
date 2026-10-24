<script lang="ts">
	// Desktop, signed in: the avatar and a small menu with the name and "Sign out" (rows ready
	// for "Profile"). The language has its own globe button.
	import { session, signOut } from '#lib/auth/session.svelte.ts';
	import { getLocale } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';

	let open = $state(false);
	let root = $state<HTMLElement>();
	const menuId = $props.id();

	const name = $derived(session.profile?.displayName ?? undefined);
	const initial = $derived(name ? [...name][0].toLocaleUpperCase(getLocale()) : undefined);

	function close(focusTrigger = false) {
		open = false;
		if (focusTrigger) root?.querySelector<HTMLButtonElement>('.avatar')?.focus();
	}

	async function leave() {
		close();
		await signOut();
	}
</script>

<svelte:window
	onclick={(event) => {
		if (open && root && !root.contains(event.target as Node)) close();
	}}
	onkeydown={(event) => {
		if (open && event.key === 'Escape') close(true);
	}}
/>

<div class="account" bind:this={root}>
	<button
		class="avatar"
		type="button"
		aria-label={m.account_menu()}
		aria-expanded={open}
		aria-controls={menuId}
		onclick={() => (open = !open)}
	>
		{#if initial}
			<span aria-hidden="true">{initial}</span>
		{:else}
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="12" cy="8" r="4"></circle>
				<path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path>
			</svg>
		{/if}
	</button>

	{#if open}
		<div class="menu" id={menuId}>
			<p class="name">{name ?? m.profile_your_account()}</p>
			<ul class="rows">
				<li><button class="row" type="button" onclick={leave}>{m.profile_sign_out()}</button></li>
			</ul>
		</div>
	{/if}
</div>

<style>
	.account {
		position: relative;
		flex-shrink: 0;
	}

	.avatar {
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 22px;
		background: var(--btn);
		color: var(--btnfg);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 17px;
		font-weight: 800;
		cursor: pointer;
	}

	.menu {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 240px;
		padding: 8px;
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: 0 8px 28px var(--sh-4);
		z-index: 20;
	}

	.name {
		margin: 0;
		padding: 8px 10px 10px;
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
		border-bottom: 1px solid var(--line);
	}

	.rows {
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
	}

	.row {
		width: 100%;
		min-height: var(--tap);
		padding: 0 10px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		font-size: 15px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--pill);
	}
</style>
