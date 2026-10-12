<script lang="ts" module>
	export type Snap = 'closed' | 'half' | 'full';
</script>

<script lang="ts">
	// The list panel on phones: dragged (or toggled from the handle button) between closed,
	// half and full screen. From 1024px wide it becomes the fixed left column (LatteDesktop).
	import { onMount, type Snippet } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';

	type Props = {
		snap: Snap;
		/** Space kept free at the top in full screen (the search bar). */
		topOffset: number;
		/** Visible height on phones, for the map controls above the panel. */
		onheight?: (height: number) => void;
		label: string;
		/** Title row: part of the drag area. */
		header: Snippet;
		children: Snippet;
	};

	let { snap = $bindable(), topOffset, onheight, label, header, children }: Props = $props();

	const DRAG_THRESHOLD = 6;
	const FLICK_SPEED = 0.5; // px per ms
	const NEXT: Record<Snap, Snap> = { closed: 'half', half: 'full', full: 'closed' };
	const LABELS: Record<Snap, () => string> = {
		closed: m.sheet_collapsed,
		half: m.sheet_half,
		full: m.sheet_full
	};

	let viewport = $state(800);
	let headerHeight = $state(96);
	let dragHeight = $state<number>();

	const snapHeights = $derived({
		closed: headerHeight + 24,
		half: Math.round(viewport * 0.45),
		full: viewport - topOffset
	});
	const current = $derived(dragHeight ?? snapHeights[snap]);

	$effect(() => {
		onheight?.(current);
	});

	onMount(() => {
		const update = () => (viewport = window.innerHeight);
		update();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});

	let start: { y: number; height: number; time: number; pointer: number } | undefined;
	let dragging = false;
	let suppressClick = false;

	function onpointerdown(event: PointerEvent) {
		if (!event.isPrimary) return;
		start = { y: event.clientY, height: current, time: event.timeStamp, pointer: event.pointerId };
		dragging = false;
	}

	function onpointermove(event: PointerEvent) {
		if (!start || event.pointerId !== start.pointer) return;
		const dy = event.clientY - start.y;
		if (!dragging && Math.abs(dy) < DRAG_THRESHOLD) return;
		if (!dragging) {
			dragging = true;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}
		dragHeight = Math.min(snapHeights.full, Math.max(snapHeights.closed, start.height - dy));
	}

	function onpointerup(event: PointerEvent) {
		if (!start || event.pointerId !== start.pointer) return;
		if (dragging && dragHeight !== undefined) {
			const order: Snap[] = ['closed', 'half', 'full'];
			const speed = (start.y - event.clientY) / Math.max(1, event.timeStamp - start.time);
			const from = start.height;
			const dropped = dragHeight;
			// A quick flick goes to the next position in its direction; otherwise the nearest.
			const target =
				speed > FLICK_SPEED
					? (order.find((s) => snapHeights[s] > from + DRAG_THRESHOLD) ?? 'full')
					: speed < -FLICK_SPEED
						? (order.findLast((s) => snapHeights[s] < from - DRAG_THRESHOLD) ?? 'closed')
						: order.reduce((best, s) =>
								Math.abs(snapHeights[s] - dropped) < Math.abs(snapHeights[best] - dropped)
									? s
									: best
							);
			snap = target;
			suppressClick = true;
		}
		dragHeight = undefined;
		dragging = false;
		start = undefined;
	}

	function toggle() {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		snap = NEXT[snap];
	}
</script>

<section
	class="sheet"
	class:dragging={dragHeight !== undefined}
	aria-label={label}
	style:--sheet-height="{current}px"
>
	<div
		class="drag"
		role="presentation"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={onpointerup}
		bind:clientHeight={headerHeight}
	>
		<button class="handle" type="button" aria-label={LABELS[snap]()} onclick={toggle}>
			<span aria-hidden="true"></span>
		</button>
		{@render header()}
	</div>
	<div class="content" class:locked={snap === 'closed'}>
		{@render children()}
	</div>
</section>

<style>
	.sheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: var(--sheet-height);
		background: var(--surface);
		border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
		box-shadow: 0 -6px 24px var(--sh-4);
		display: flex;
		flex-direction: column;
		transition: height 0.25s ease;
		z-index: 5;
	}

	.sheet.dragging {
		transition: none;
	}

	.drag {
		flex-shrink: 0;
		padding: 0 20px;
		touch-action: none;
		cursor: grab;
	}

	.handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 24px;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.handle span {
		width: 44px;
		height: 5px;
		border-radius: 3px;
		background: var(--line);
	}

	.content {
		flex-grow: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 20px calc(20px + env(safe-area-inset-bottom));
	}

	.content.locked {
		overflow: hidden;
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet {
			transition: none;
		}
	}

	@media (min-width: 1024px) {
		.sheet {
			position: relative;
			height: auto;
			min-height: 0;
			border-radius: 0;
			box-shadow: none;
			border-right: 1px solid var(--line);
			transition: none;
		}

		.drag {
			padding: 22px 24px 14px;
			touch-action: auto;
			cursor: auto;
		}

		.handle {
			display: none;
		}

		.content {
			padding: 0 24px 24px;
		}
	}
</style>
