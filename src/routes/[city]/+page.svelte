<script lang="ts">
	// The city map and list live in +layout.svelte, shared with the place pages, so going back
	// from a place finds the list as it was.
	import { APP_NAME } from '#lib/config.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.city_meta_title({ city: data.city.name })} · {APP_NAME}</title>
	<meta name="description" content={m.city_meta_description({ city: data.city.name })} />
</svelte:head>
