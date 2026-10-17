<script lang="ts">
	// A line icon from icons.ts; decorative (the control around it carries the label).
	import { ICONS, type IconName } from './icons.ts';

	let { name, class: className = '' }: { name: IconName; class?: string } = $props();

	const shape = $derived<{ d: string; circles?: [number, number, number][] }>(ICONS[name]);
</script>

<svg class="icon {className}" viewBox="0 0 24 24" aria-hidden="true">
	<path d={shape.d}></path>
	{#each shape.circles ?? [] as [cx, cy, r], i (i)}
		<circle {cx} {cy} {r}></circle>
	{/each}
</svg>
