<script lang="ts">
	// A cup for cafés, a glass for bars (OSM amenity); nothing when unknown.
	import Icon from './Icon.svelte';

	let { amenity, class: className = '' }: { amenity: 'cafe' | 'bar' | null; class?: string } =
		$props();
</script>

{#if amenity}
	<Icon name={amenity} class={className} />
{/if}
