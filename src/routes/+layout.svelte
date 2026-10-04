<script lang="ts">
	import '@fontsource-variable/geist';
	import '@fontsource-variable/geist-mono';
	import '#lib/styles/global.css';
	import favicon from '#lib/assets/favicon.svg';
	import { APP_NAME } from '#lib/config.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#FAF7F3" />
	<title>{APP_NAME}</title>
</svelte:head>

{@render children()}
