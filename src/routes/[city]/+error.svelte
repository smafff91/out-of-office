<script lang="ts">
	// Errors inside a city (a missing place): shown where the place page would be, with the
	// city map still around it on desktop, and a way back to the map.
	import { page } from '$app/state';
	import ErrorMessage from '#lib/components/ErrorMessage.svelte';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
</script>

<ErrorMessage
	status={page.status}
	href={localizeHref(`/${page.params.city}`)}
	label={m.action_back_to_map()}
/>
