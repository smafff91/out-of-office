/** Line icons from the mockups (24px viewBox), drawn by Icon.svelte: paths, plus circles. */
type IconShape = { d: string; circles?: [cx: number, cy: number, r: number][] };

export const ICONS = {
	back: { d: 'M15 5l-7 7 7 7' },
	close: { d: 'M6 6l12 12M18 6L6 18' },
	shield: { d: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zM8.5 12l2.5 2.5 4.5-5' },
	share: { d: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6' },
	directions: { d: 'M3 11l18-8-8 18-2-8z' },
	check: { d: 'M5 12l5 5L20 7' },
	info: { d: 'M12 11v5M12 8h.01', circles: [[12, 12, 9]] },
	thumb: {
		d: 'M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7'
	},
	wifi: {
		d: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0',
		circles: [[12, 19.5, 1]]
	},
	outlets: { d: 'M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0z M12 17v5' },
	noise: { d: 'M4 9h4l5-4v14l-5-4H4z M17 9a4 4 0 0 1 0 6' },
	clock: { d: 'M12 7v5l3 2', circles: [[12, 12, 9]] },
	laptop: { d: 'M4 6h16v10H4z M2 19h20' },
	flag: { d: 'M5 21V4h11l-2 4 2 4H5' },
	pin: { d: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z', circles: [[12, 9.5, 2.5]] },
	cafe: {
		d: 'M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3'
	},
	bar: { d: 'M6 3h12l-6 9zM12 12v8M8 21h8M8.2 6h7.6' },
	refresh: { d: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4h-4M5.5 21v-4h4' },
	camera: { d: 'M4 8h3l2-3h6l2 3h3v11H4z', circles: [[12, 13, 3.5]] }
} satisfies Record<string, IconShape>;

export type IconName = keyof typeof ICONS;
