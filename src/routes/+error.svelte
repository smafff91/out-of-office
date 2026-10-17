<script lang="ts">
	// Errors outside a city (or a city that does not exist): back to the home page.
	import { page } from '$app/state';
	import ErrorMessage from '#lib/components/ErrorMessage.svelte';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
</script>

<div class="page">
	<ErrorMessage status={page.status} href={localizeHref('/')} label={m.action_go_home()} />
</div>

<style>
	.page {
		height: 100dvh;
	}
</style>
