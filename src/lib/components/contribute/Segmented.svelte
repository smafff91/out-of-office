<script lang="ts" generics="T extends string">
	// One required attribute of the form (LatteContribute): Foam track, the chosen answer white.
	// Labels wrap instead of overflowing (longer Spanish and Catalan texts).
	type Props = {
		/** id of the visible question. */
		labelledby: string;
		options: readonly { value: T; label: string }[];
		value?: T;
		invalid?: boolean;
		onchange: (value: T) => void;
	};

	let { labelledby, options, value, invalid = false, onchange }: Props = $props();
</script>

<div
	class="segs"
	class:invalid
	role="radiogroup"
	aria-labelledby={labelledby}
	aria-invalid={invalid}
	style:grid-template-columns="repeat({options.length}, minmax(0, 1fr))"
>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === option.value}
			onclick={() => onchange(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.segs {
		display: grid;
		gap: 4px;
		padding: 4px;
		border-radius: 14px;
		background: var(--pill);
	}

	.segs.invalid {
		box-shadow: 0 0 0 1.5px var(--danger);
	}

	button {
		min-height: 44px;
		padding: 6px 8px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--muted);
		font-size: 14px;
		font-weight: 500;
		line-height: 1.2;
		overflow-wrap: anywhere;
		cursor: pointer;
	}

	button[aria-checked='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 4px var(--sh-3);
	}
</style>
