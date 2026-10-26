<script lang="ts">
	// Contribution form /{city}/{place}/update (LatteContribute → LatteSignIn → LatteThanks).
	// Not for search engines. The city map stays mounted around it (../../+layout.svelte): on
	// desktop the form takes the left panel, next to the map with the place selected.
	import { page } from '$app/state';
	import ContributeForm from '#lib/components/contribute/ContributeForm.svelte';
	import { APP_NAME } from '#lib/config.ts';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const place = $derived(data.place);
	const city = $derived(data.city);
	const checkin = $derived(page.url.searchParams.has('checkin'));
</script>

<svelte:head>
	<title>{m.contribute_meta_title({ name: place.name })} · {APP_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#key place.id}
	<ContributeForm
		{place}
		city={{ id: city.id, name: city.name }}
		{checkin}
		placeHref={localizeHref(`/${city.slug}/${place.slug}`)}
		mapHref={localizeHref(`/${city.slug}`)}
	/>
{/key}
