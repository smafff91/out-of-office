<script lang="ts" generics="T extends string">
	// Optional answers as chips (laptop rules, details): several can be on; they wrap onto new
	// lines with longer texts.
	type Props = {
		labelledby: string;
		options: readonly { value: T; label: string }[];
		selected: readonly T[];
		ontoggle: (value: T) => void;
	};

	let { labelledby, options, selected, ontoggle }: Props = $props();
</script>

<div class="chips" role="group" aria-labelledby={labelledby}>
	{#each options as option (option.value)}
		<button
			type="button"
			aria-pressed={selected.includes(option.value)}
			onclick={() => ontoggle(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	button {
		min-height: 44px;
		padding: 8px 14px;
		border-radius: 22px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font-size: 14px;
		font-weight: 500;
		line-height: 1.2;
		text-align: left;
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		background: var(--btn);
		color: var(--btnfg);
		border-color: var(--btn);
	}
</style>
