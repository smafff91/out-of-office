<script lang="ts">
	// Search bar, account button and Certified filter, as in LatteHome. Drawn now so the layout
	// is final; they stay inactive (aria-disabled, no action) until their features land.
	import * as m from '#lib/paraglide/messages.js';
</script>

<header class="top">
	<div class="row">
		<!-- TODO(feature 5): search by place name and neighborhood. -->
		<button class="search" type="button" aria-disabled="true">
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="11" cy="11" r="7"></circle>
				<path d="M20 20l-4-4"></path>
			</svg>
			<span>{m.common_search_placeholder()}</span>
		</button>
		<!-- TODO(feature 10): link to /me. -->
		<button class="square" type="button" aria-label={m.common_account()} aria-disabled="true">
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="12" cy="8" r="4"></circle>
				<path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path>
			</svg>
		</button>
	</div>
	<div>
		<!-- TODO(feature 5): toggles the Certified filter, together with the list. -->
		<button class="chip" type="button" aria-pressed="false" aria-disabled="true">
			<span class="seal" aria-hidden="true">
				<svg class="icon" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"></path></svg>
			</span>
			{m.common_certified()}
		</button>
	</div>
</header>

<style>
	.top {
		position: absolute;
		top: 16px;
		left: var(--gutter);
		right: var(--gutter);
		display: flex;
		flex-direction: column;
		gap: 10px;
		pointer-events: none;
	}

	.top button {
		pointer-events: auto;
		border: 0;
		background: var(--surface);
		color: var(--ink);
		cursor: default;
	}

	.row {
		display: flex;
		gap: 10px;
	}

	.search,
	.square {
		height: 54px;
		border-radius: var(--radius);
		box-shadow: 0 4px 16px var(--sh-4);
		display: flex;
		align-items: center;
	}

	.search {
		flex-grow: 1;
		min-width: 0;
		gap: 12px;
		padding: 0 16px;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: var(--tracking-tight);
		text-align: left;
	}

	.search span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.square {
		width: 54px;
		flex-shrink: 0;
		justify-content: center;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 14px 0 10px;
		border-radius: 19px;
		box-shadow: 0 2px 8px var(--sh-4);
		font-size: 14px;
		font-weight: 600;
	}

	@media (min-width: 768px) {
		.top {
			right: auto;
			width: 480px;
		}
	}
</style>
