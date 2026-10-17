<script lang="ts">
	// Error message with a way back: a missing page (404) or anything else.
	import { APP_NAME } from '#lib/config.ts';
	import * as m from '#lib/paraglide/messages.js';

	type Props = { status: number; href: string; label: string };

	let { status, href, label }: Props = $props();

	const notFound = $derived(status === 404);
</script>

<svelte:head>
	<title>{notFound ? m.error_not_found_title() : m.error_generic_title()} · {APP_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="error">
	<span class="app">{APP_NAME}</span>
	<h1>{notFound ? m.error_not_found_title() : m.error_generic_title()}</h1>
	<p>{notFound ? m.error_not_found_body() : m.error_generic_body()}</p>
	<a class="primary" {href}>{label}</a>
</main>

<style>
	.error {
		min-height: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding: 48px 20px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
	}

	.app {
		font-size: 18px;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--muted);
	}

	h1 {
		margin: 0;
		font-size: 31px;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.05;
	}

	p {
		margin: 0 0 10px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
	}

	.primary {
		height: var(--btn-height);
		border-radius: var(--radius);
		background: var(--btn);
		color: var(--btnfg);
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		font-size: 16px;
		font-weight: 700;
	}
</style>
