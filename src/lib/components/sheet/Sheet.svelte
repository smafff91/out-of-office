<script lang="ts">
	// Modal shell shared by the sign-in sheet, the account sheet and the language dialog: a
	// native <dialog> (focus stays inside, Esc closes it), a tap on the backdrop closes it, and
	// so does Back, through a shallow history entry (page.state.sheet).
	// - variant "bottom": a bottom sheet with a handle on phones (LatteSignIn), a centered panel
	//   from 1024px wide.
	// - variant "center": a centered window at every width (the language grid on desktop).
	// The content is created on each opening, so forms start fresh.
	import { onMount, untrack, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onBeforeLeave } from '#lib/auth/handoff.ts';
	import * as m from '#lib/paraglide/messages.js';

	type Props = {
		open: boolean;
		name: NonNullable<App.PageState['sheet']>;
		variant?: 'bottom' | 'center';
		/** id of the visible title inside, or a label when there is none. */
		labelledby?: string;
		label?: string;
		/** After the sheet has fully closed (e.g. to continue once signed in). */
		onclosed?: () => void;
		children: Snippet;
	};

	let {
		open = $bindable(),
		name,
		variant = 'bottom',
		labelledby,
		label,
		onclosed,
		children
	}: Props = $props();

	let dialog = $state<HTMLDialogElement>();
	/** The history entry for Back exists: closing goes back through it. */
	let pushed = $state(false);

	// Open: show the dialog, add the history entry (once).
	$effect(() => {
		if (!open || !dialog || dialog.open) return;
		untrack(() => {
			dialog?.showModal();
			if (!pushed && page.state.sheet !== name) {
				// Counted only once the entry exists, so the effect below cannot close it early.
				void goto(page.url.href, { state: { ...page.state, sheet: name }, shallow: true }).then(
					() => (pushed = true)
				);
			}
		});
	});

	// Closed by Back (our entry is gone) or by `open = false` from outside. Every value is read
	// up front, so the effect reruns when any of them changes.
	$effect(() => {
		const entryGone = pushed && page.state.sheet !== name;
		if ((open && !entryGone) || !dialog?.open) return;
		untrack(close);
	});

	/** The current history entry without our sheet (same page, same other state). */
	function dropEntryState() {
		void goto(page.url.href, {
			state: { ...page.state, sheet: undefined },
			shallow: true,
			replace: true
		});
	}

	// A leftover entry of ours while closed (the page was reloaded with the sheet open, so
	// SvelteKit sees the state only on a later Back): clean it, or Back would seem to do nothing.
	$effect(() => {
		if (!open && page.state.sheet === name) untrack(dropEntryState);
	});

	// Reload for a language change with the sheet open: do not leave the entry behind.
	onMount(() =>
		onBeforeLeave(() => {
			if (page.state.sheet === name) dropEntryState();
		})
	);

	/**
	 * Closes at once, then removes our history entry if it is still there. The sheet never
	 * waits for the browser to process history.back(), which can be late or, without a user
	 * gesture, skipped.
	 */
	function close() {
		if (!dialog?.open) return;
		const entryLeft = pushed && page.state.sheet === name;
		pushed = false;
		open = false;
		dialog.close();
		if (entryLeft) history.back();
		onclosed?.();
	}

	/** Closes the sheet (close button, backdrop, Esc, or a caller such as a finished sign-in). */
	export function dismiss() {
		close();
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet {variant}"
	aria-labelledby={labelledby}
	aria-label={labelledby ? undefined : label}
	oncancel={(event) => {
		event.preventDefault();
		dismiss();
	}}
	onclick={(event) => {
		if (event.target === dialog) dismiss();
	}}
>
	<div class="panel">
		{#if variant === 'bottom'}
			<div class="handle" aria-hidden="true"></div>
		{/if}
		<button class="close tap-target" type="button" aria-label={m.action_close()} onclick={dismiss}>
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
				><path d="M6 6l12 12M18 6L6 18"></path></svg
			>
		</button>
		{#if open}
			{@render children()}
		{/if}
	</div>
</dialog>

<style>
	.sheet {
		/* Opened from inside bars that let taps through to the map (pointer-events: none):
		   the top layer does not stop the property from being inherited. */
		pointer-events: auto;
		padding: 0;
		border: 0;
		background: var(--surface);
		color: var(--ink);
		overscroll-behavior: contain;
	}

	.sheet::backdrop {
		background: var(--scrim);
	}

	.bottom {
		width: 100%;
		max-width: 100%;
		max-height: 92dvh;
		margin: auto 0 0;
		border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
	}

	.bottom[open] {
		animation: rise 220ms ease-out;
	}

	.center {
		width: min(720px, calc(100% - 2 * var(--gutter)));
		max-height: min(80dvh, 720px);
		margin: auto;
		border-radius: var(--radius-sheet);
		box-shadow: 0 12px 40px var(--sh-4);
	}

	.center[open] {
		animation: appear 160ms ease-out;
	}

	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}

	@keyframes appear {
		from {
			opacity: 0;
			transform: scale(0.98);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet[open] {
			animation: none;
		}
	}

	.panel {
		position: relative;
		padding: 10px 20px calc(32px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.center .panel {
		padding: 28px;
	}

	@media (min-width: 1024px) {
		.bottom {
			width: 440px;
			margin: auto;
			border-radius: var(--radius-sheet);
			box-shadow: 0 12px 40px var(--sh-4);
		}

		.bottom[open] {
			animation: appear 160ms ease-out;
		}

		.bottom .panel {
			padding: 28px;
		}

		.handle {
			display: none;
		}
	}

	.handle {
		align-self: center;
		width: 44px;
		height: 5px;
		border-radius: 3px;
		background: var(--line);
	}

	.close {
		position: absolute;
		top: 14px;
		right: 14px;
		z-index: 1;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 16px;
		background: var(--pill);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.close .icon {
		width: 16px;
		height: 16px;
	}
</style>
