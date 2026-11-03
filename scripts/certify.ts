/**
 * Certification from the terminal (the admin pages call the same database functions in
 * feature 9). Works on the development project (.env) and on production (.env.production),
 * always through the secret key, never through the linked CLI project:
 *
 *   npm run certify -- --pick <city>/<place> --note "<sources checked>"
 *        "Picked by our team" (also a place nobody has rated yet). On a picked place it renews
 *        the date (after a --due check). Removes a block and a "Certification removed" line.
 *   npm run certify -- --unpick <city>/<place> --reason "<why>" [--block] [--no-notice]
 *        Removes the badge, picked or confirmed. A confirmed place is always blocked (it would
 *        come back by itself); --block also blocks a picked one. --no-notice: no "Certification
 *        removed in …" line on the place page (the reason is saved anyway).
 *   npm run certify -- --unblock <city>/<place> --reason "<why>"
 *        Allows the automatic certification again, then recomputes the place.
 *   npm run certify -- --pick-file <file> [--dry-run]
 *        Picks every row of a picks file that has a slug (note = sources_note, month =
 *        picked_month) and saves its team info; rows without a slug are skipped, certified
 *        places only get their team info updated. One confirmation for the whole file;
 *        --dry-run writes nothing. File format: scripts/pick-file.ts.
 *   npm run certify -- --list <city>          certified places (origin, date, score, users), blocked ones
 *   npm run certify -- --recent <city>        automatic changes of the last 30 days
 *   npm run certify -- --due <city>           picks older than 12 months without the conditions
 *   npm run certify -- --recompute <city>     recomputes every place now (the daily job does it at 03:23)
 *   npm run certify:prod -- …                 the same on production (.env.production)
 *
 * --pick, --unpick and --unblock show the place first and ask to type its slug; --pick-file asks
 * to type the city slug (--yes skips both).
 * Rules: docs/certificazione.md; logic: supabase/migrations/20261031120000_certification.sql.
 */
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
	parsePicksFile,
	planPicks,
	runPicks,
	summarize,
	teamInfoPayload,
	type PickClient
} from './pick-file.ts';

const { values: args } = parseArgs({
	options: {
		pick: { type: 'string' },
		'pick-file': { type: 'string' },
		'dry-run': { type: 'boolean', default: false },
		unpick: { type: 'string' },
		unblock: { type: 'string' },
		list: { type: 'string' },
		recent: { type: 'string' },
		due: { type: 'string' },
		recompute: { type: 'string' },
		note: { type: 'string' },
		reason: { type: 'string' },
		block: { type: 'boolean', default: false },
		'no-notice': { type: 'boolean', default: false },
		yes: { type: 'boolean', default: false }
	}
});

const USAGE = `Usage:
  npm run certify -- --pick <city>/<place> --note "<sources checked>"
  npm run certify -- --unpick <city>/<place> --reason "<why>" [--block] [--no-notice]
  npm run certify -- --unblock <city>/<place> --reason "<why>"
  npm run certify -- --pick-file <file> [--dry-run]
  npm run certify -- --list <city> | --recent <city> | --due <city> | --recompute <city>`;

/** What a missing condition means, for --due and the place summary. */
const CONDITIONS: Record<string, string> = {
	approved: 'place not approved',
	users: 'not enough users',
	checkins: 'fewer than half checked in',
	span: 'less than 14 days between first and last',
	score: 'score below 75%',
	wifi: 'Wi-Fi not Slow/Fast for most',
	long_stays: 'long stays not welcome for most',
	daytime: 'not open during the day on weekdays',
	reports: 'open reports',
	revocation: 'a revocation condition holds'
};

const REASONS: Record<string, string> = {
	conditions_met: 'conditions met',
	score_below: 'score below 60%',
	wifi_none: 'most recent updates: no Wi-Fi',
	long_stays_not_really: 'most recent updates: long stays not welcome'
};

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) fail(`Missing ${name} (see .env.example).`);
	return value;
}

// Checked before anything else: a pick without its sources, or a removal without its reason,
// never reaches the database.
const actions = [
	args.pick,
	args['pick-file'],
	args.unpick,
	args.unblock,
	args.list,
	args.recent,
	args.due,
	args.recompute
].filter((value) => value !== undefined);
if (actions.length !== 1) fail(USAGE);
const note = args.note?.trim();
const reason = args.reason?.trim();
if (args.pick !== undefined && !note) fail(`--pick needs --note "<sources checked>".\n\n${USAGE}`);
if ((args.unpick !== undefined || args.unblock !== undefined) && !reason) {
	fail(`--${args.unpick !== undefined ? 'unpick' : 'unblock'} needs --reason "<why>".\n\n${USAGE}`);
}
if ((args.block || args['no-notice']) && args.unpick === undefined) {
	fail(`--block and --no-notice go with --unpick.\n\n${USAGE}`);
}
if (args['dry-run'] && args['pick-file'] === undefined)
	fail(`--dry-run goes with --pick-file.\n\n${USAGE}`);

const url = requireEnv('PUBLIC_SUPABASE_URL');
const host = new URL(url).hostname;
const ref = host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : '';
if (!/^[a-z0-9]+$/.test(ref)) fail(`PUBLIC_SUPABASE_URL is not a Supabase project URL: ${url}`);
const label = ref === process.env.DEV_PROJECT_REF?.trim() ? 'development' : 'NOT development';
console.log(`→ Project ${ref} (${label})`);

const supabase = createClient(url, requireEnv('SUPABASE_SECRET_KEY'), {
	auth: { persistSession: false, autoRefreshToken: false }
});

type Check = {
	users: number;
	min_users: number;
	checkin_users: number;
	span_days: number;
	votes: number;
	score_pct: number | null;
	daytime: boolean | null;
	open_reports: number;
	revocation: { reason: string } | null;
	missing: string[];
	meets: boolean;
};

type Status = {
	name: string;
	slug: string;
	level: 'osm_only' | 'community' | 'certified';
	origin: 'picked' | 'confirmed' | null;
	certified_at: string | null;
	revoked_at: string | null;
	revoked_notice: boolean;
	blocked: boolean;
	missing_from_osm: boolean;
	check: Check;
};

const day = (value: string | null) => (value ? value.slice(0, 10) : '—');
const missingText = (missing: string[]) =>
	missing.map((code) => CONDITIONS[code] ?? code).join('; ');

async function cityId(slug: string): Promise<string> {
	const { data, error } = await supabase.from('cities').select('id').eq('slug', slug).maybeSingle();
	if (error) fail(error.message);
	if (!data) fail(`No city "${slug}".`);
	return data.id as string;
}

async function placeId(target: string): Promise<string> {
	const [citySlug, placeSlug, extra] = target.split('/');
	if (!citySlug || !placeSlug || extra !== undefined) fail(USAGE);
	const { data, error } = await supabase
		.from('places')
		.select('id')
		.eq('city_id', await cityId(citySlug))
		.eq('slug', placeSlug)
		.maybeSingle();
	if (error) fail(error.message);
	if (!data) fail(`No place "${placeSlug}" in ${citySlug}.`);
	return data.id as string;
}

/** The database's error, in words. */
function errorText(error: PostgrestError): string {
	if (error.message === 'would_be_revoked') {
		const detail = JSON.parse(error.details ?? '{}') as Record<string, unknown>;
		const numbers =
			detail.reason === 'score_below'
				? `score ${detail.score_pct}% on ${detail.votes} votes of the last 12 months`
				: `${detail.count} of the ${detail.recent} updates of the last 90 days`;
		return `Not picked: it would lose the badge at once (${REASONS[String(detail.reason)] ?? detail.reason}: ${numbers}).`;
	}
	const known: Record<string, string> = {
		not_allowed: 'The key is not allowed to certify (is SUPABASE_SECRET_KEY the secret key?).',
		place_missing_from_osm: 'The place is gone from OpenStreetMap: check it first.',
		already_confirmed: 'Already certified by users (confirmed): nothing to pick.',
		not_certified: 'The place is not certified.',
		not_blocked: 'The automatic certification of this place is not blocked.',
		invalid_team_info: 'Team info not valid.',
		month_in_future: 'The month is in the future.'
	};
	return known[error.message] ?? error.message;
}

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase.rpc(name, params);
	if (error) fail(errorText(error));
	return data as T;
}

function describe(status: Status) {
	const { check } = status;
	const level =
		status.level === 'certified'
			? `certified (${status.origin === 'picked' ? 'Picked by our team' : 'Confirmed by users'}, since ${day(status.certified_at)})`
			: status.level === 'community'
				? 'community'
				: 'not checked yet (osm_only)';
	console.log(`\n${status.name} — ${level}`);
	if (status.blocked) console.log('  Automatic certification: BLOCKED');
	if (status.revoked_at && status.level !== 'certified') {
		console.log(
			`  Removed on ${day(status.revoked_at)}${status.revoked_notice ? ' (line shown on the page)' : ' (no line on the page)'}`
		);
	}
	if (status.missing_from_osm) console.log('  Gone from OpenStreetMap');
	console.log(
		`  ${check.users}/${check.min_users} users, ${check.checkin_users} checked in, ${check.span_days} days, ` +
			`score ${check.score_pct ?? '—'}% (${check.votes} votes), daytime hours ${check.daytime ?? 'unknown'}, ` +
			`${check.open_reports} open reports`
	);
	console.log(
		check.meets
			? '  Meets the automatic certification.'
			: `  Missing for the automatic certification: ${missingText(check.missing)}`
	);
}

async function confirm(slug: string): Promise<void> {
	if (args.yes) return;
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await prompt.question(`Type the place slug (${slug}) to confirm: `);
	prompt.close();
	if (answer.trim() !== slug) fail('Nothing changed.');
}

async function pick(target: string) {
	const id = await placeId(target);
	const status = await rpc<Status>('certification_status', { p_place_id: id });
	describe(status);
	const renew = status.level === 'certified' && status.origin === 'picked';
	console.log(
		renew
			? `\nRenew the pick (new date, same badge). Sources: ${note}`
			: `\nPick it: "Picked by our team" on the page.${status.blocked ? ' The block is removed.' : ''} Sources: ${note}`
	);
	await confirm(status.slug);
	const result = await rpc<{ level: string; origin: string; renewed: boolean }>('pick_place', {
		p_place_id: id,
		p_note: note
	});
	if (result.origin === 'confirmed') {
		console.log('✔ Picked, and it already meets the conditions: now "Confirmed by users".');
	} else {
		console.log(result.renewed ? '✔ Pick renewed.' : '✔ Picked by our team.');
	}
}

async function unpick(target: string) {
	const id = await placeId(target);
	const status = await rpc<Status>('certification_status', { p_place_id: id });
	describe(status);
	if (status.level !== 'certified') fail('The place is not certified.');
	const block = args.block || status.origin === 'confirmed';
	const notice = !args['no-notice'];
	console.log(
		`\nRemove the badge. Reason: ${reason}` +
			`\n  "Certification removed" line on the page for 90 days: ${notice ? 'YES' : 'NO'}` +
			`\n  Automatic certification blocked: ${block ? `YES${status.origin === 'confirmed' ? ' (always, for a confirmed place)' : ''}` : 'NO'}`
	);
	await confirm(status.slug);
	const result = await rpc<{ level: string; blocked: boolean }>('unpick_place', {
		p_place_id: id,
		p_reason: reason,
		p_block: args.block,
		p_notice: notice
	});
	console.log(`✔ Badge removed: now ${result.level}${result.blocked ? ', blocked' : ''}.`);
}

async function unblock(target: string) {
	const id = await placeId(target);
	const status = await rpc<Status>('certification_status', { p_place_id: id });
	describe(status);
	if (!status.blocked) fail('The automatic certification of this place is not blocked.');
	console.log(`\nUnblock the automatic certification, then recompute. Reason: ${reason}`);
	await confirm(status.slug);
	const result = await rpc<{ level: string }>('unblock_place', {
		p_place_id: id,
		p_reason: reason
	});
	console.log(
		result.level === 'certified'
			? '✔ Unblocked: it meets the conditions, now "Confirmed by users".'
			: `✔ Unblocked: still ${result.level}.`
	);
}

async function list(citySlug: string) {
	const rows = await rpc<
		{
			slug: string;
			name: string;
			level: string;
			origin: string | null;
			certified_at: string | null;
			blocked: boolean;
			score_pct: number | null;
			votes: number;
			users: number;
		}[]
	>('certification_list', { p_city_id: await cityId(citySlug) });
	const certified = rows.filter((row) => row.level === 'certified');
	const blocked = rows.filter((row) => row.blocked);
	console.log(`\nCertified in ${citySlug}: ${certified.length}`);
	for (const row of certified) {
		const score = row.score_pct === null ? '—' : `${row.score_pct}%`;
		console.log(
			`  ${(row.origin ?? '').padEnd(9)}  ${day(row.certified_at)}  ${score.padStart(4)} ${String(row.votes).padStart(3)} votes ${String(row.users).padStart(3)} users  ${row.slug}`
		);
	}
	console.log(`\nBlocked (no automatic certification): ${blocked.length}`);
	for (const row of blocked) {
		console.log(`  ${row.level.padEnd(9)}  ${String(row.users).padStart(3)} users  ${row.slug}`);
	}
}

async function recent(citySlug: string) {
	const rows = await rpc<
		{
			slug: string;
			kind: string;
			to_level: string;
			reason: string | null;
			shows_notice: boolean;
			created_at: string;
		}[]
	>('certification_recent', { p_city_id: await cityId(citySlug), p_days: 30 });
	console.log(`\nAutomatic changes in ${citySlug}, last 30 days: ${rows.length}`);
	for (const row of rows) {
		const what =
			row.kind === 'revoked'
				? `badge removed → ${row.to_level}`
				: row.kind === 'confirmed'
					? 'picked → confirmed by users'
					: 'certified (confirmed by users)';
		console.log(
			`  ${row.created_at.slice(0, 16).replace('T', ' ')}  ${what.padEnd(30)}  ${row.slug}  (${REASONS[row.reason ?? ''] ?? row.reason})`
		);
	}
}

async function due(citySlug: string) {
	const rows = await rpc<
		{
			slug: string;
			certified_at: string;
			missing: string[];
			users: number;
			score_pct: number | null;
		}[]
	>('certification_due', { p_city_id: await cityId(citySlug) });
	console.log(`\nPicks to check again in ${citySlug}: ${rows.length}`);
	for (const row of rows) {
		console.log(
			`  picked ${day(row.certified_at)}  ${row.slug}  (${row.users} users, score ${row.score_pct ?? '—'}%): ${missingText(row.missing)}`
		);
	}
	if (rows.length) {
		console.log(
			'\nAfter checking: --pick again to renew, or --unpick to remove the badge. They keep it meanwhile.'
		);
	}
}

async function recompute(citySlug: string) {
	const result = await rpc<{ checked: number; changes: number }>('recompute_city_certification', {
		p_city_id: await cityId(citySlug)
	});
	console.log(`✔ ${result.checked} places recomputed, ${result.changes} changes (see --recent).`);
}

/** --pick-file through the secret key: errors are thrown, so one row never stops the others. */
const pickClient: PickClient = {
	async cityId(slug) {
		const { data, error } = await supabase
			.from('cities')
			.select('id')
			.eq('slug', slug)
			.maybeSingle();
		if (error) throw new Error(error.message);
		return data?.id as string | undefined;
	},
	async place(city, slug) {
		const { data, error } = await supabase
			.from('places')
			.select('id')
			.eq('city_id', city)
			.eq('slug', slug)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return undefined;
		const status = await supabase.rpc('certification_status', { p_place_id: data.id });
		if (status.error) throw new Error(errorText(status.error));
		const value = status.data as Status;
		return {
			id: data.id as string,
			level: value.level,
			origin: value.level === 'certified' ? value.origin : null,
			missingFromOsm: value.missing_from_osm
		};
	},
	async pick(placeId, note, pickedOn) {
		const { data, error } = await supabase.rpc('pick_place', {
			p_place_id: placeId,
			p_note: note,
			p_picked_on: pickedOn
		});
		if (error) throw new Error(errorText(error));
		return data as { origin: string };
	},
	async setTeamInfo(placeId, info, month) {
		const { data, error } = await supabase.rpc('set_place_team_info', {
			p_place_id: placeId,
			p_info: info,
			p_month: month
		});
		if (error) throw new Error(errorText(error));
		return data as string;
	}
};

const ACTIONS = {
	pick: 'pick + team info',
	team_info: 'already certified: team info only (if different)',
	no_slug: 'skip: no slug',
	not_found: 'ERROR: slug not found',
	missing_from_osm: 'ERROR: gone from OpenStreetMap'
};

async function pickFile(path: string) {
	let raw: unknown;
	try {
		raw = JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		fail(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	const { file, problems } = parsePicksFile(raw);
	if (!file) fail(`${path} is not valid, nothing changed:\n  ${problems.join('\n  ')}`);

	const dryRun = args['dry-run'];
	const plan = await planPicks(file, pickClient).catch((error: Error) => fail(error.message));
	console.log(
		`\n${file.city} · month ${file.picked_month} · ${path}${dryRun ? ' · DRY RUN' : ''}\n`
	);
	for (const row of plan) {
		const origin =
			row.action === 'team_info'
				? ` (${row.origin === 'confirmed' ? 'confirmed by users' : 'picked'})`
				: '';
		console.log(
			`${String(row.line).padStart(3)}. ${row.row.slug ?? '—'} · ${row.row.name}: ${ACTIONS[row.action]}${origin}`
		);
		if (row.action === 'pick' || row.action === 'team_info') {
			const info = Object.entries(teamInfoPayload(row.row.team))
				.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('+') : String(value)}`)
				.join(', ');
			console.log(`       team: ${info || 'nothing known'}`);
		}
	}
	const toPick = plan.filter((row) => row.action === 'pick').length;
	const teamOnly = plan.filter((row) => row.action === 'team_info').length;
	console.log(
		`\n${toPick} to pick, ${teamOnly} already certified, ${plan.length - toPick - teamOnly} skipped or not found.`
	);
	if (!toPick && !teamOnly) fail('Nothing to do.');

	if (!dryRun && !args.yes) {
		const prompt = createInterface({ input: process.stdin, output: process.stdout });
		const answer = await prompt.question(
			`\nPick ${toPick} places on ${ref} (${label})? Type the city slug (${file.city}) to confirm: `
		);
		prompt.close();
		if (answer.trim() !== file.city) fail('Nothing changed.');
	}

	const results = await runPicks(file, plan, pickClient, { dryRun });
	for (const result of results.filter((r) => r.outcome === 'error')) {
		console.log(`✖ ${result.line}. ${result.slug ?? result.name}: ${result.detail}`);
	}
	const total = summarize(results);
	console.log(
		`\n${dryRun ? 'Dry run, nothing written. Would pick' : '✔ Picked'} ${total.picked}` +
			(total.pickedConfirmed ? ` (${total.pickedConfirmed} already confirmed by users)` : '') +
			`, ${total.alreadyCertified} already certified, ${total.skipped} skipped, ${total.errors} errors.` +
			(dryRun
				? ''
				: `\nTeam info: ${total.teamCreated} created, ${total.teamUpdated} updated, ${total.teamUnchanged} unchanged.`)
	);
	if (total.errors) process.exitCode = 1;
}

if (args.pick) await pick(args.pick);
else if (args['pick-file']) await pickFile(args['pick-file']);
else if (args.unpick) await unpick(args.unpick);
else if (args.unblock) await unblock(args.unblock);
else if (args.list) await list(args.list);
else if (args.recent) await recent(args.recent);
else if (args.due) await due(args.due);
else if (args.recompute) await recompute(args.recompute);
