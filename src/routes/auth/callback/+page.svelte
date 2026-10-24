<script lang="ts">
	// Where Google and the email link come back (PUBLIC_AUTH_REDIRECT_URL): finishes the sign-in,
	// then opens the page the user was on (?next=). On failure the root layout reopens the
	// sign-in sheet there with the message (Google canceled, link expired…).
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authErrorKind } from '#lib/auth/errors.ts';
	import { stash, takeStash } from '#lib/auth/handoff.ts';
	import { readReturnParams } from '#lib/auth/next.ts';
	import { PENDING_SIGN_IN_KEY, type PendingSignIn } from '#lib/auth/session.svelte.ts';
	import { APP_NAME } from '#lib/config.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { getAuthClient } from '#lib/supabase/client.ts';

	onMount(async () => {
		// The email token sits in the fragment; the final goto replaces this history entry.
		const params = readReturnParams(window.location.href);

		const pending = takeStash<PendingSignIn>(PENDING_SIGN_IN_KEY);
		const auth = getAuthClient().auth;
		let error: unknown = params.error ? { code: params.error } : undefined;
		if (!error) {
			try {
				if (params.code) {
					({ error } = await auth.exchangeCodeForSession(params.code));
				} else if (params.tokenHash) {
					({ error } = await auth.verifyOtp({ token_hash: params.tokenHash, type: 'email' }));
				}
			} catch (thrown) {
				error = thrown;
			}
		}

		if (error) {
			stash(PENDING_SIGN_IN_KEY, {
				context: pending?.context ?? 'menu',
				error: authErrorKind(error, { online: navigator.onLine })
			} satisfies PendingSignIn);
		}
		await goto(params.next, { replace: true });
	});
</script>

<svelte:head>
	<title>{m.auth_callback_status()} · {APP_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="callback">
	<p role="status">{m.auth_callback_status()}</p>
</main>

<style>
	.callback {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--gutter);
	}

	p {
		margin: 0;
		font-size: 15px;
		color: var(--muted);
	}
</style>
