<script lang="ts">
	// Sign-in on its own (LatteSignIn): "Sign in" on desktop and, in feature 7b, sending an
	// update. One instance lives in the root layout; openSignIn() opens it. The phone account
	// sheet shows the same SignInForm inside itself instead.
	import { signInSheet } from '#lib/auth/session.svelte.ts';
	import Sheet from '#lib/components/sheet/Sheet.svelte';
	import SignInForm from './SignInForm.svelte';

	let sheet = $state<ReturnType<typeof Sheet>>();
	/** Run once the sheet has closed after a sign-in that stayed on the page (email code). */
	let afterClose: (() => void) | undefined;

	const titleId = $props.id();
</script>

<Sheet
	bind:this={sheet}
	bind:open={signInSheet.open}
	name="sign-in"
	labelledby={titleId}
	onclosed={() => {
		const callback = afterClose;
		afterClose = undefined;
		callback?.();
	}}
>
	<SignInForm
		{titleId}
		context={signInSheet.options.context}
		initialError={signInSheet.options.error}
		onsignedin={() => {
			afterClose = signInSheet.options.onsignedin;
			sheet?.dismiss();
		}}
	/>
</Sheet>
