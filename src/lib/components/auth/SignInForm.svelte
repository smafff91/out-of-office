<script lang="ts">
	// Sign-in content (LatteSignIn), shown inside SignInSheet and in the account sheet.
	// Email: one message with a 6-digit code and a link. The code is typed here, so the page and
	// whatever the user had filled in stay put; the link remains a fallback.
	// The code field keeps only ASCII digits, cleaned before the 6-digit limit (no maxlength: the
	// browser would cut pasted text such as "627909" after a zero-width space before we could clean it).
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { CODE_LENGTH, isCompleteCode, normalizeCode } from '#lib/auth/code.ts';
	import { looksLikeEmail } from '#lib/auth/email.ts';
	import {
		authErrorKind,
		retryAfterSeconds,
		type AuthAction,
		type AuthErrorKind
	} from '#lib/auth/errors.ts';
	import { AUTH_ERROR_TEXT, tooManyText } from '#lib/auth/labels.ts';
	import {
		codeRequestCount,
		sendEmailCode,
		signInWithGoogle,
		verifyEmailCode,
		type SignInContext
	} from '#lib/auth/session.svelte.ts';
	import { RESEND_COOLDOWN_SECONDS } from '#lib/config.ts';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import { richParts } from '#lib/i18n/rich.ts';
	import * as m from '#lib/paraglide/messages.js';
	import GoogleLogo from './GoogleLogo.svelte';

	type Props = {
		context?: SignInContext;
		/** Shown on arrival (e.g. Google sign-in canceled). */
		initialError?: AuthErrorKind;
		/** id for the title, so the surrounding dialog can point at it. */
		titleId: string;
		onsignedin: () => void;
	};

	let { context = 'menu', initialError, titleId, onsignedin }: Props = $props();

	const uid = $props.id();
	let step = $state<'start' | 'code'>('start');
	let email = $state('');
	let code = $state('');
	let codeInput = $state<HTMLInputElement>();
	let busy = $state<'google' | 'email' | 'code'>();
	// Only the value on arrival matters: the form is created anew each time the sheet opens.
	let error = $state<AuthErrorKind | undefined>(untrack(() => initialError));
	let emailInvalid = $state(false);
	let resent = $state(false);
	let sentAt = $state<number>();
	/** Too many attempts: nothing can be sent before this time (ms). */
	let blockedUntil = $state<number>();
	let now = $state(Date.now());

	const contribution = $derived(context === 'contribution');
	const secondsUntil = (time: number | undefined) =>
		time === undefined ? 0 : Math.max(0, Math.ceil((time - now) / 1000));
	const resendWait = $derived(
		sentAt === undefined ? 0 : secondsUntil(sentAt + RESEND_COOLDOWN_SECONDS * 1000)
	);
	const blockedWait = $derived(secondsUntil(blockedUntil));
	const blocked = $derived(blockedWait > 0);
	const legal = $derived(
		richParts(
			(slots) => m.auth_legal(slots as { terms: string; privacy: string }),
			['terms', 'privacy']
		)
	);
	const errorText = $derived.by(() => {
		if (!error) return undefined;
		if (error === 'too_many')
			return tooManyText(blockedUntil === undefined ? undefined : blockedWait);
		if (error === 'wrong_code' && codeRequestCount(email.trim()) > 1) {
			return m.auth_error_wrong_code_latest();
		}
		return AUTH_ERROR_TEXT[error]();
	});
	const next = () => `${page.url.pathname}${page.url.search}`;
	const online = () => navigator.onLine;

	// Countdowns (resend, too many attempts).
	$effect(() => {
		if (resendWait === 0 && blockedWait === 0) return;
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	// The wait is over: the message would only say "too many" without a time, so drop it.
	$effect(() => {
		if (error === 'too_many' && blockedUntil !== undefined && !blocked) error = undefined;
	});

	function fail(thrown: unknown, action: AuthAction) {
		error = authErrorKind(thrown, { action, sentAt, online: online() });
		if (error === 'too_many') {
			const wait = retryAfterSeconds(thrown, action);
			now = Date.now();
			blockedUntil = wait === undefined ? undefined : now + wait * 1000;
		}
	}

	async function google() {
		if (busy) return;
		error = undefined;
		if (!online()) return void (error = 'offline');
		busy = 'google';
		try {
			// Leaves the page: the draft is stashed first (runBeforeLeave), the user comes back to it.
			await signInWithGoogle(next(), context);
		} catch (thrown) {
			fail(thrown, 'google');
			busy = undefined;
		}
	}

	async function send(event?: SubmitEvent) {
		event?.preventDefault();
		if (busy || blocked) return;
		error = undefined;
		emailInvalid = !looksLikeEmail(email);
		if (emailInvalid) return;
		if (!online()) return void (error = 'offline');
		busy = 'email';
		try {
			await sendEmailCode(email.trim(), next());
			resent = step === 'code';
			sentAt = now = Date.now();
			setCode('');
			step = 'code';
			await tick();
			codeInput?.focus();
		} catch (thrown) {
			fail(thrown, 'send');
		} finally {
			busy = undefined;
		}
	}

	/** Always called with the cleaned value: exactly 6 ASCII digits reach Supabase. */
	async function verify(value: string = code) {
		if (busy || blocked || !isCompleteCode(value)) return;
		error = undefined;
		if (!online()) return void (error = 'offline');
		busy = 'code';
		try {
			await verifyEmailCode(email.trim(), value);
			onsignedin();
		} catch (thrown) {
			fail(thrown, 'verify');
			resent = false;
			setCode('');
		} finally {
			busy = undefined;
		}
	}

	/** Keeps the field and the state in step with the cleaned code; sends it once complete. */
	function setCode(value: string) {
		code = value;
		if (codeInput && codeInput.value !== value) codeInput.value = value;
		if (isCompleteCode(value)) void verify(value);
	}

	function onCodePaste(event: ClipboardEvent) {
		event.preventDefault();
		setCode(normalizeCode(event.clipboardData?.getData('text') ?? ''));
	}

	// Typing a non-digit does nothing (no flicker); everything else is cleaned on input.
	function onCodeBeforeInput(event: InputEvent) {
		if (event.inputType === 'insertText' && event.data && !/[0-9]/.test(event.data)) {
			event.preventDefault();
		}
	}

	function onCodeInput(event: Event) {
		setCode(normalizeCode((event.currentTarget as HTMLInputElement).value));
	}

	function changeEmail() {
		step = 'start';
		error = undefined;
		resent = false;
		setCode('');
	}
</script>

<div class="sign-in">
	{#if step === 'start'}
		<div class="intro">
			<h2 id={titleId}>{contribution ? m.auth_title_contribution() : m.auth_title()}</h2>
			<p>{contribution ? m.auth_body_contribution() : m.auth_body()}</p>
		</div>

		<button class="google" type="button" disabled={!!busy} onclick={google}>
			<GoogleLogo />
			{m.auth_google()}
		</button>

		<div class="or" aria-hidden="true"><span></span>{m.auth_or()}<span></span></div>

		<form class="field" novalidate onsubmit={send}>
			<label for="{uid}-email">{m.auth_email_label()}</label>
			<input
				id="{uid}-email"
				type="email"
				autocomplete="email"
				inputmode="email"
				placeholder={m.auth_email_placeholder()}
				aria-invalid={emailInvalid}
				aria-describedby={emailInvalid ? `${uid}-email-error` : undefined}
				bind:value={email}
			/>
			{#if emailInvalid}
				<p class="field-error" id="{uid}-email-error">{m.auth_email_invalid()}</p>
			{/if}
			<button class="primary" type="submit" disabled={!!busy || blocked}>
				{busy === 'email' ? m.auth_sending() : m.auth_email_send()}
			</button>
		</form>
	{:else}
		<div class="intro">
			<h2 id={titleId}>{m.auth_code_title()}</h2>
			<p>{m.auth_code_body({ email: email.trim() })}</p>
		</div>

		<form
			class="field"
			novalidate
			onsubmit={(event) => {
				event.preventDefault();
				void verify();
			}}
		>
			<label for="{uid}-code">{m.auth_code_label()}</label>
			<input
				id="{uid}-code"
				class="code"
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				aria-invalid={error === 'wrong_code' || error === 'expired_code'}
				aria-describedby={resent ? `${uid}-resent` : undefined}
				bind:this={codeInput}
				value={code}
				onpaste={onCodePaste}
				onbeforeinput={onCodeBeforeInput}
				oninput={onCodeInput}
			/>
			{#if resent}
				<p class="status" id="{uid}-resent" role="status">{m.auth_code_sent_again()}</p>
			{/if}
			<button
				class="primary"
				type="submit"
				disabled={!!busy || blocked || code.length !== CODE_LENGTH}
			>
				{busy === 'code' ? m.auth_verifying() : m.auth_code_submit()}
			</button>
		</form>

		<div class="links">
			<button
				class="link"
				type="button"
				disabled={!!busy || blocked || resendWait > 0}
				onclick={() => send()}
			>
				{resendWait > 0 ? m.auth_code_resend_in({ seconds: resendWait }) : m.auth_code_resend()}
			</button>
			<button class="link" type="button" disabled={!!busy} onclick={changeEmail}>
				{m.auth_code_change_email()}
			</button>
		</div>
	{/if}

	{#if errorText}
		<p class="error" role="alert">{errorText}</p>
	{/if}

	<p class="legal">
		{#each legal as part, i (i)}
			{#if 'text' in part}{part.text}{:else if part.slot === 'terms'}<a
					href={localizeHref('/terms')}>{m.auth_legal_terms()}</a
				>{:else}<a href={localizeHref('/privacy')}>{m.auth_legal_privacy()}</a>{/if}
		{/each}
	</p>
</div>

<style>
	.sign-in {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 40px 0 0;
	}

	h2 {
		margin: 0;
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.intro p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
		overflow-wrap: anywhere;
	}

	.google,
	.primary {
		height: var(--btn-height);
		border-radius: var(--radius);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	/* Light theme of the Google button guidelines: white fill, a neutral outline. */
	.google {
		border: 1px solid var(--muted);
		background: var(--surface);
		color: var(--ink);
	}

	.primary {
		border: 0;
		background: var(--btn);
		color: var(--btnfg);
	}

	.google:disabled,
	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13px;
		color: var(--muted);
	}

	.or span {
		flex-grow: 1;
		height: 1px;
		background: var(--line);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field .primary {
		margin-top: 10px;
	}

	label {
		font-size: 14px;
		font-weight: 700;
	}

	input {
		height: 54px;
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 0 16px;
		font: 400 16px var(--font-sans);
		background: var(--bg);
		color: var(--ink);
	}

	input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.code {
		font-family: var(--font-mono);
		font-size: 24px;
		letter-spacing: 0.3em;
	}

	.links {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.link {
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		font-size: 15px;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}

	.link:disabled {
		color: var(--muted);
		text-decoration: none;
		cursor: default;
	}

	.field-error,
	.error {
		margin: 0;
		font-size: 14px;
		line-height: 1.4;
		color: var(--danger);
	}

	.status {
		margin: 0;
		font-size: 14px;
		line-height: 1.4;
		color: var(--muted);
	}

	.legal {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
	}
</style>
