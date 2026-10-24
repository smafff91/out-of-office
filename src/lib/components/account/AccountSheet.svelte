<script lang="ts">
	// Account on phones: one bottom sheet opened from the account icon of the top bar.
	// - Signed out: "Sign in" (the sign-in form slides in here, no second sheet) and Language.
	// - Signed in: initial and name, Language, then Sign out at the bottom.
	// Secondary views (Language, Sign in) slide in sideways inside the same sheet, with a back
	// arrow; Back on the phone closes the whole sheet. Rows are a list, ready for "Your
	// contributions" and "Profile".
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { session, signOut } from '#lib/auth/session.svelte.ts';
	import SignInForm from '#lib/components/auth/SignInForm.svelte';
	import LanguageList from '#lib/components/i18n/LanguageList.svelte';
	import Sheet from '#lib/components/sheet/Sheet.svelte';
	import { getLocale } from '#lib/i18n/locale.ts';
	import { languageName } from '#lib/i18n/language-list.ts';
	import * as m from '#lib/paraglide/messages.js';

	let { open = $bindable() }: { open: boolean } = $props();

	const uid = $props.id();
	const current = getLocale();
	const currentName = languageName(current, current);
	let sheet = $state<ReturnType<typeof Sheet>>();
	let view = $state<'main' | 'language' | 'sign-in'>('main');
	/** 1 = forward (from the right), -1 = back. */
	let direction = $state(1);
	let body = $state<HTMLElement>();

	const signedIn = $derived(session.status === 'signed-in');
	const name = $derived(session.profile?.displayName ?? undefined);
	const initial = $derived(name ? [...name][0].toLocaleUpperCase(current) : undefined);
	const reducedMotion = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const slide = (node: Element) =>
		fly(node, { x: 40 * direction, duration: reducedMotion() ? 0 : 200, opacity: 0 });

	async function go(next: typeof view) {
		direction = next === 'main' ? -1 : 1;
		view = next;
		await tick();
		body?.querySelector<HTMLElement>('h2')?.focus();
	}

	async function leave() {
		await signOut();
		sheet?.dismiss();
	}
</script>

<Sheet
	bind:this={sheet}
	bind:open
	name="account"
	labelledby="{uid}-title"
	onclosed={() => (view = 'main')}
>
	<div class="body" bind:this={body}>
		{#key view}
			<div class="view" in:slide>
				{#if view === 'main'}
					{#if signedIn}
						<div class="who">
							<span class="avatar" aria-hidden="true">
								{#if initial}{initial}{:else}
									<svg class="icon" viewBox="0 0 24 24"
										><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"
										></path></svg
									>
								{/if}
							</span>
							<h2 id="{uid}-title" tabindex="-1">{name ?? m.profile_your_account()}</h2>
						</div>
					{:else}
						<h2 id="{uid}-title" class="visually-hidden" tabindex="-1">{m.common_account()}</h2>
						<button class="primary" type="button" onclick={() => go('sign-in')}>
							{m.action_sign_in()}
						</button>
					{/if}

					<ul class="rows">
						<li>
							<button class="row" type="button" onclick={() => go('language')}>
								<span>{m.common_language()}</span>
								<span class="value" lang={current}>{currentName}</span>
								<svg class="icon chevron" viewBox="0 0 24 24" aria-hidden="true"
									><path d="M9 5l7 7-7 7"></path></svg
								>
							</button>
						</li>
					</ul>

					{#if signedIn}
						<button class="sign-out" type="button" onclick={leave}>{m.profile_sign_out()}</button>
					{/if}
				{:else}
					<div class="sub">
						<button
							class="back tap-target"
							type="button"
							aria-label={m.action_back()}
							onclick={() => go('main')}
						>
							<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
								><path d="M15 5l-7 7 7 7"></path></svg
							>
						</button>
						{#if view === 'language'}
							<h2 id="{uid}-title" tabindex="-1">{m.common_language()}</h2>
						{/if}
					</div>
					{#if view === 'language'}
						<LanguageList onsame={() => sheet?.dismiss()} />
					{:else}
						<SignInForm titleId="{uid}-title" onsignedin={() => sheet?.dismiss()} />
					{/if}
				{/if}
			</div>
		{/key}
	</div>
</Sheet>

<style>
	.body {
		overflow: hidden;
	}

	.view {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding-top: 8px;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 14px;
		padding-right: 44px;
	}

	.avatar {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		border-radius: 24px;
		background: var(--btn);
		color: var(--btnfg);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 800;
	}

	h2 {
		margin: 0;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.15;
		overflow-wrap: anywhere;
		outline: none;
	}

	.primary {
		height: var(--btn-height);
		margin-right: 44px;
		border: 0;
		border-radius: var(--radius);
		background: var(--btn);
		color: var(--btnfg);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--line);
	}

	.rows li {
		border-bottom: 1px solid var(--line);
	}

	.row {
		width: 100%;
		min-height: 56px;
		padding: 0 2px;
		border: 0;
		background: none;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 16px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.row .value {
		margin-left: auto;
		font-weight: 400;
		color: var(--muted);
	}

	.chevron {
		color: var(--muted);
	}

	.sign-out {
		align-self: flex-start;
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
	}

	.sub {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-right: 44px;
		min-height: 32px;
	}

	.back {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		border: 0;
		border-radius: 16px;
		background: var(--pill);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.back .icon {
		width: 16px;
		height: 16px;
	}
</style>
