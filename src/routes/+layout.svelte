<script lang="ts">
	import '@fontsource-variable/geist';
	import '@fontsource-variable/geist-mono';
	import '#lib/styles/global.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { takeStash } from '#lib/auth/handoff.ts';
	import {
		openSignIn,
		PENDING_SIGN_IN_KEY,
		startSession,
		type PendingSignIn
	} from '#lib/auth/session.svelte.ts';
	import SignInSheet from '#lib/components/auth/SignInSheet.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(startSession);

	// Back from a failed Google sign-in (or an expired email link): reopen the sheet with the
	// message, on the page the user was on. /auth/callback writes it, so skip that page.
	afterNavigate(() => {
		if (page.route.id === '/auth/callback') return;
		const pending = takeStash<PendingSignIn>(PENDING_SIGN_IN_KEY);
		if (pending?.error) openSignIn({ context: pending.context, error: pending.error });
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#FAF7F3" />
</svelte:head>

{@render children()}

<SignInSheet />
