/**
 * `npm run certify -- --pick-file <file>`: picks every row of a picks file (data/picks/*.json)
 * that has a slug, and saves the team info of each (place_team_info). Pure logic around an
 * injected client, so the plan, the dry run and the skipped rows are tested without a database
 * (pick-file.test.ts); scripts/certify.ts gives the client and asks the confirmation.
 *
 * File: { city, picked_month: "YYYY-MM", places: [{ name, address, district, sources_note,
 * slug?, choose_branch?, team: { wifi, outlets, noise, long_stays, laptop_rules, extras, note } }] }
 * Team values: wifi fast/slow/available, outlets plenty/a_few/none, noise quiet/noisy,
 * long_stays welcome/not_really, laptop_rules lunch/weekends, extras as in the form; null or
 * an empty list = not known.
 */

export type TeamInfo = {
	wifi: 'fast' | 'slow' | 'available' | null;
	outlets: 'plenty' | 'a_few' | 'none' | null;
	noise: 'quiet' | 'noisy' | null;
	long_stays: 'welcome' | 'not_really' | null;
	laptop_rules: ('lunch' | 'weekends')[];
	extras: ('air_conditioning' | 'toilet' | 'large_tables' | 'minimum_spend')[];
	note: string | null;
};

export type PickFileRow = {
	name: string;
	address: string;
	district: string;
	sources_note: string;
	slug?: string | null;
	choose_branch?: boolean | null;
	team: TeamInfo;
};

export type PicksFile = { city: string; picked_month: string; places: PickFileRow[] };

/** What the command needs from the database (certify.ts: the secret key). Errors are thrown. */
export interface PickClient {
	cityId(slug: string): Promise<string | undefined>;
	place(
		cityId: string,
		slug: string
	): Promise<
		| {
				id: string;
				level: 'osm_only' | 'community' | 'certified';
				origin: 'picked' | 'confirmed' | null;
				missingFromOsm: boolean;
		  }
		| undefined
	>;
	/** pick_place with the month of the file. */
	pick(placeId: string, note: string, pickedOn: string): Promise<{ origin: string }>;
	/** set_place_team_info: created, updated or unchanged. */
	setTeamInfo(placeId: string, info: Record<string, unknown>, month: string): Promise<string>;
}

export type PlannedRow = {
	/** 1-based, as in the matching table. */
	line: number;
	row: PickFileRow;
	placeId?: string;
	action:
		| 'pick'
		| 'team_info' // already certified: no pick, only the team info
		| 'no_slug'
		| 'not_found'
		| 'missing_from_osm';
	/** Already certified: how. */
	origin?: 'picked' | 'confirmed' | null;
};

export type RowResult = {
	line: number;
	name: string;
	slug?: string;
	outcome:
		| 'picked'
		| 'picked_confirmed' // picked, and already meets the automatic certification
		| 'already_certified'
		| 'skipped'
		| 'error';
	teamInfo?: string;
	detail?: string;
};

const WIFI = ['fast', 'slow', 'available'];
const OUTLETS = ['plenty', 'a_few', 'none'];
const NOISE = ['quiet', 'noisy'];
const LONG_STAYS = ['welcome', 'not_really'];
const RULES = ['lunch', 'weekends'];
const EXTRAS = ['air_conditioning', 'toilet', 'large_tables', 'minimum_spend'];
const NOTE_MAX = 140;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The file, checked before anything is shown or asked: every problem at once, or the file. */
export function parsePicksFile(raw: unknown): { file?: PicksFile; problems: string[] } {
	const problems: string[] = [];
	if (!isObject(raw)) return { problems: ['The file is not a JSON object.'] };
	if (typeof raw.city !== 'string' || !SLUG.test(raw.city)) problems.push('"city": a city slug.');
	if (typeof raw.picked_month !== 'string' || !MONTH.test(raw.picked_month)) {
		problems.push('"picked_month": "YYYY-MM".');
	}
	if (!Array.isArray(raw.places) || !raw.places.length) {
		problems.push('"places": a list of places.');
		return { problems };
	}
	const slugs = new Map<string, number>();
	raw.places.forEach((place: unknown, index) => {
		const at = `Row ${index + 1}`;
		if (!isObject(place)) return problems.push(`${at}: not an object.`);
		const label = typeof place.name === 'string' ? `${at} (${place.name})` : at;
		if (typeof place.name !== 'string' || !place.name.trim()) problems.push(`${at}: "name".`);
		if (place.slug !== undefined && place.slug !== null) {
			if (typeof place.slug !== 'string' || !SLUG.test(place.slug)) {
				problems.push(`${label}: "slug" is not a slug.`);
			} else if (slugs.has(place.slug)) {
				problems.push(`${label}: slug ${place.slug} already on row ${slugs.get(place.slug)}.`);
			} else {
				slugs.set(place.slug, index + 1);
			}
			if (typeof place.sources_note !== 'string' || !place.sources_note.trim()) {
				problems.push(`${label}: "sources_note" (the note of the pick).`);
			}
		}
		const team = place.team;
		if (!isObject(team)) return problems.push(`${label}: "team".`);
		const oneOf = (key: string, values: string[]) => {
			const value = team[key];
			if (value !== null && value !== undefined && !values.includes(value as string)) {
				problems.push(
					`${label}: team.${key} "${String(value)}" is not one of ${values.join(', ')}.`
				);
			}
		};
		const listOf = (key: string, values: string[]) => {
			const value = team[key];
			if (value === null || value === undefined) return;
			if (!Array.isArray(value) || value.some((item) => !values.includes(item as string))) {
				problems.push(`${label}: team.${key} takes only ${values.join(', ')}.`);
			}
		};
		oneOf('wifi', WIFI);
		oneOf('outlets', OUTLETS);
		oneOf('noise', NOISE);
		oneOf('long_stays', LONG_STAYS);
		listOf('laptop_rules', RULES);
		listOf('extras', EXTRAS);
		if (team.note !== null && team.note !== undefined) {
			if (typeof team.note !== 'string') problems.push(`${label}: team.note is not text.`);
			else if ([...team.note.trim()].length > NOTE_MAX) {
				problems.push(`${label}: team.note is longer than ${NOTE_MAX} characters.`);
			}
		}
	});
	if (problems.length) return { problems };
	return { file: raw as unknown as PicksFile, problems };
}

/** The team info as set_place_team_info takes it (database enum values, nothing unknown). */
export function teamInfoPayload(team: TeamInfo): Record<string, unknown> {
	const rules = (team.laptop_rules ?? []).map((rule) =>
		rule === 'lunch' ? 'no_laptops_lunch' : 'no_laptops_weekends'
	);
	const note = team.note?.trim();
	return {
		...(team.wifi && { wifi: team.wifi }),
		...(team.outlets && { outlets: team.outlets }),
		...(team.noise && { noise: team.noise }),
		...(team.long_stays && { long_stays: team.long_stays }),
		...(rules.length && { laptop_rules: rules }),
		...(team.extras?.length && { extras: team.extras }),
		...(note && { note })
	};
}

/** What will happen to each row. Reads only. */
export async function planPicks(file: PicksFile, client: PickClient): Promise<PlannedRow[]> {
	const cityId = await client.cityId(file.city);
	if (!cityId) throw new Error(`No city "${file.city}".`);
	const plan: PlannedRow[] = [];
	for (const [index, row] of file.places.entries()) {
		const line = index + 1;
		if (!row.slug) {
			plan.push({ line, row, action: 'no_slug' });
			continue;
		}
		const place = await client.place(cityId, row.slug);
		if (!place) plan.push({ line, row, action: 'not_found' });
		else if (place.missingFromOsm)
			plan.push({ line, row, placeId: place.id, action: 'missing_from_osm' });
		else if (place.level === 'certified') {
			plan.push({ line, row, placeId: place.id, action: 'team_info', origin: place.origin });
		} else plan.push({ line, row, placeId: place.id, action: 'pick' });
	}
	return plan;
}

/**
 * Picks and saves the team info, row by row: an error on one row never stops the others. With
 * dryRun nothing is written: the results say what would happen.
 */
export async function runPicks(
	file: PicksFile,
	plan: PlannedRow[],
	client: PickClient,
	{ dryRun }: { dryRun: boolean }
): Promise<RowResult[]> {
	const pickedOn = `${file.picked_month}-01`;
	const results: RowResult[] = [];
	for (const planned of plan) {
		const { line, row, placeId } = planned;
		const base = { line, name: row.name, ...(row.slug && { slug: row.slug }) };
		if (planned.action === 'no_slug') {
			results.push({ ...base, outcome: 'skipped', detail: 'no slug' });
			continue;
		}
		if (planned.action === 'not_found' || planned.action === 'missing_from_osm' || !placeId) {
			results.push({
				...base,
				outcome: 'error',
				detail: planned.action === 'missing_from_osm' ? 'gone from OpenStreetMap' : 'slug not found'
			});
			continue;
		}
		if (dryRun) {
			results.push({
				...base,
				outcome: planned.action === 'pick' ? 'picked' : 'already_certified',
				teamInfo: 'saved if different',
				detail: 'dry run'
			});
			continue;
		}
		try {
			let outcome: RowResult['outcome'] = 'already_certified';
			if (planned.action === 'pick') {
				const result = await client.pick(placeId, row.sources_note.trim(), pickedOn);
				outcome = result.origin === 'confirmed' ? 'picked_confirmed' : 'picked';
			}
			const teamInfo = await client.setTeamInfo(placeId, teamInfoPayload(row.team), pickedOn);
			results.push({ ...base, outcome, teamInfo });
		} catch (error) {
			results.push({
				...base,
				outcome: 'error',
				detail: error instanceof Error ? error.message : String(error)
			});
		}
	}
	return results;
}

/** "3 picked, 1 already certified (team info updated), 2 skipped, 0 errors". */
export function summarize(results: RowResult[]) {
	const count = (test: (result: RowResult) => boolean) => results.filter(test).length;
	return {
		picked: count((r) => r.outcome === 'picked' || r.outcome === 'picked_confirmed'),
		pickedConfirmed: count((r) => r.outcome === 'picked_confirmed'),
		alreadyCertified: count((r) => r.outcome === 'already_certified'),
		teamCreated: count((r) => r.teamInfo === 'created'),
		teamUpdated: count((r) => r.teamInfo === 'updated'),
		teamUnchanged: count((r) => r.teamInfo === 'unchanged'),
		skipped: count((r) => r.outcome === 'skipped'),
		errors: count((r) => r.outcome === 'error')
	};
}
