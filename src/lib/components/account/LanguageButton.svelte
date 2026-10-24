<script lang="ts">
	// Desktop: a globe next to "Sign in", always there, signed in or not. Opens the languages in
	// a centered window, in columns.
	import LanguageList from '#lib/components/i18n/LanguageList.svelte';
	import Sheet from '#lib/components/sheet/Sheet.svelte';
	import { languageName } from '#lib/i18n/language-list.ts';
	import { getLocale } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';

	const uid = $props.id();
	const current = getLocale();
	const label = m.language_button_label({ language: languageName(current, current) });
	let open = $state(false);
	let sheet = $state<ReturnType<typeof Sheet>>();
</script>

<button
	class="globe"
	type="button"
	aria-label={label}
	title={label}
	aria-haspopup="dialog"
	onclick={() => (open = true)}
>
	<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="12" r="9"></circle>
		<path
			d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"
		></path>
	</svg>
</button>

<Sheet bind:this={sheet} bind:open name="language" variant="center" labelledby="{uid}-title">
	<h2 id="{uid}-title">{m.common_language()}</h2>
	<LanguageList columns onsame={() => sheet?.dismiss()} />
</Sheet>

<style>
	.globe {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		border: 0;
		border-radius: 22px;
		background: none;
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.globe:hover {
		background: var(--pill);
	}

	h2 {
		margin: 0;
		padding-right: 44px;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
</style>
