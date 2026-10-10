<script lang="ts">
	// "We're just getting started here" (LatteHomeDay1), with real counts. Shown while the city
	// has fewer certified places than LAUNCH_MESSAGE_MAX_CERTIFIED; a dismissal is remembered on
	// this device. Rendered after mount only, so it never flashes for people who closed it.
	import { onMount } from 'svelte';
	import { LAUNCH_MESSAGE_MAX_CERTIFIED } from '#lib/config.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { CitySummary } from '#lib/supabase/cities.ts';

	let { city }: { city: CitySummary } = $props();

	const storageKey = $derived(`launch-message-dismissed:${city.slug}`);
	let visible = $state(false);

	onMount(() => {
		let dismissed = false;
		try {
			dismissed = localStorage.getItem(storageKey) === '1';
		} catch {
			// Storage blocked: show the message, a dismissal just won't be remembered.
		}
		visible = !dismissed && city.certified < LAUNCH_MESSAGE_MAX_CERTIFIED;
	});

	function dismiss() {
		visible = false;
		try {
			localStorage.setItem(storageKey, '1');
		} catch {
			// Storage blocked: hidden for this visit only.
		}
	}
</script>

{#if visible}
	<div class="launch" role="note">
		<div class="text">
			<span class="title">{m.launch_title()}</span>
			<span class="body">
				{m.launch_counts({
					certified: city.certified,
					checked: city.community,
					city: city.name
				})}
				{m.launch_waiting({ count: city.unchecked })}
			</span>
		</div>
		<button
			class="close tap-target"
			type="button"
			aria-label={m.action_dismiss()}
			onclick={dismiss}
		>
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
				><path d="M6 6l12 12M18 6L6 18"></path></svg
			>
		</button>
	</div>
{/if}

<style>
	.launch {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px;
		border-radius: var(--radius);
		background: var(--pill);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex-grow: 1;
	}

	.title {
		font-size: 15px;
		font-weight: 700;
	}

	.body {
		font-size: 13px;
		line-height: 1.4;
		color: var(--muted);
	}

	.close {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		margin: -4px -4px 0 0;
		border: 0;
		border-radius: 14px;
		background: transparent;
		color: var(--muted);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.close .icon {
		width: 16px;
		height: 16px;
	}
</style>
