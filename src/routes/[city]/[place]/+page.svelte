<script lang="ts">
	// Place page /{city}/{place}: rendered on the server for search engines (title, description,
	// canonical link, schema.org data). The city map and list stay mounted around it
	// (../+layout.svelte), so Back returns to the list as it was.
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import PlaceDetail from '#lib/components/place/PlaceDetail.svelte';
	import { APP_NAME } from '#lib/config.ts';
	import { localizeHref } from '#lib/i18n/locale.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { jsonLd, placeStructuredData } from '#lib/places/structured-data.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const place = $derived(data.place);
	const city = $derived(data.city);

	const url = $derived(`${page.url.origin}${page.url.pathname}`);
	const area = $derived(place.neighborhood ?? city.name);
	const description = $derived(
		place.level === 'certified'
			? m.place_meta_description_certified({ name: place.name, area })
			: place.level === 'community'
				? m.place_meta_description_community({ name: place.name, area })
				: m.place_meta_description_unchecked({ name: place.name, area })
	);
	const structuredData = $derived(jsonLd(placeStructuredData(place, url, city.name)));
	const backHref = $derived(localizeHref(`/${city.slug}`));
	const updateHref = $derived(localizeHref(`/${city.slug}/${place.slug}/update`));

	/** Opened from the list or the map: Back returns there; otherwise it goes to the city map. */
	let fromCity = false;
	afterNavigate(({ from }) => {
		fromCity = from?.route.id === '/[city]';
	});

	function back(event: MouseEvent) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}
		event.preventDefault();
		if (fromCity) history.back();
		else void goto(backHref);
	}
</script>

<svelte:head>
	<title>{m.place_meta_title({ name: place.name, area })} · {APP_NAME}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON escaped by jsonLd(), no "<" left. -->
	{@html `<script type="application/ld+json">${structuredData}<` + `/script>`}
</svelte:head>

<PlaceDetail {place} {url} {backHref} {updateHref} onback={back} />
