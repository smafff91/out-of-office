/**
 * All user-facing text lives here, so it can be reviewed and translated in one place.
 * Follow the copy rules in CLAUDE.md: contributors are always "users"; city and neighborhood names
 * come from data (pass them in), never written in the copy.
 */
export const copy = {
	common: {
		searchPlaceholder: 'Where to work today?',
		certified: 'Certified for remote work',
		account: 'Account',
		map: 'Map',
		osmAttribution: '© OpenStreetMap contributors',
		offline: "You're offline"
	},
	place: {
		score: (percent: number) => `${percent}% would work here again`,
		scoreFew: (yes: number, total: number) => `${yes} of ${total}`,
		confirmedBy: (count: number) => `Confirmed by ${count} ${count === 1 ? 'user' : 'users'}`,
		noWorkInfo: 'No work info yet'
	},
	city: {
		notYet: (city: string) => `Not in ${city} yet`
	},
	tokens: {
		title: 'Design tokens',
		intro: 'Temporary page to check colors, fonts and buttons against the Latte mockups.',
		colors: 'Colors',
		type: 'Type',
		components: 'Components',
		titleSample: 'Work nearby',
		bodySample: 'Fast Wi‑Fi, plenty of outlets and a quiet corner.',
		mutedSample: '3 min walk · Open until 20:00',
		monoSamples: ['94%', '2 of 2', '3 days ago'],
		primaryButton: 'Add your experience',
		secondaryButton: 'Report a problem',
		pills: ['Fast Wi‑Fi', 'Plenty of outlets', 'Quiet']
	}
} as const;
