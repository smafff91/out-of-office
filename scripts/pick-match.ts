/**
 * Matching the rows of a picks file (data/picks/*.json) to imported OSM places, by name, then by
 * address (street and number in the OSM tags), barri and district. Pure: no network, no
 * geocoding. Used by scripts/match-picks.ts; it never decides an ambiguous case.
 */

export type PickRow = {
	name: string;
	address: string;
	district: string;
	choose_branch?: boolean | null;
	slug?: string | null;
};

export type Candidate = {
	slug: string;
	name: string;
	address: string | null;
	barri: string | null;
	district: string | null;
	missingFromOsm: boolean;
};

export type Match =
	| { kind: 'certain'; place: Candidate; why: string }
	| { kind: 'ambiguous'; candidates: Candidate[]; why: string }
	| { kind: 'not_found'; why: string };

/** Chains with several branches in the city: never matched on the name alone. */
export const CHAINS = [
	'federal',
	'sandwichez',
	'alsur',
	'hidden',
	'the miners',
	'buenas migas',
	'honest greens',
	'vivari'
];

/** Words that do not tell places apart: "Café", "Cafè", "Coffee"… */
const NAME_NOISE = new Set(['the', 'cafe', 'cafes', 'coffee', 'cafeteria', 'and']);
/** Street types and particles: "Carrer de la Ribera" → "ribera". */
const STREET_NOISE = new Set([
	'carrer',
	'calle',
	'passatge',
	'passeig',
	'avinguda',
	'gran',
	'via',
	'rambla',
	'placa',
	'ronda',
	'travessera',
	'de',
	'del',
	'dels',
	'la',
	'les',
	'el',
	'els',
	'l',
	'd'
]);
const ARTICLES = new Set(['la', 'les', 'el', 'els', 'l', 'd', 'de', 'del', 'i']);

function plain(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[’']/g, ' ')
		.replace(/&/g, ' and ');
}

function words(text: string): string[] {
	return plain(text)
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);
}

/** "Federal Café Gòtic" → ["federal", "gotic"]; anything in parentheses is dropped. */
export function nameWords(name: string): string[] {
	return words(name.replace(/\(.*?\)/g, ' ')).filter((w) => !NAME_NOISE.has(w));
}

/** "Sarrià - Sant Gervasi", "l'Eixample", "el Poble-sec" → "sarriasantgervasi", "eixample", "poblesec". */
export function areaKey(area: string): string {
	return words(area)
		.filter((w) => !ARTICLES.has(w))
		.join('');
}

/** "Carrer de Bruniquer, 33-35" → { street: "bruniquer", numbers: [33, 35] }. */
export function parseAddress(address: string | null): { street: string; numbers: number[] } | null {
	if (!address) return null;
	const [streetPart, numberPart = ''] = address.split(',');
	const street = words(streetPart ?? '')
		.filter((w) => !STREET_NOISE.has(w))
		.join(' ');
	if (!street) return null;
	const found = numberPart.match(/\d+/g)?.map(Number) ?? [];
	const numbers =
		found.length === 2 && found[1]! > found[0]!
			? Array.from({ length: found[1]! - found[0]! + 1 }, (_, i) => found[0]! + i)
			: found.slice(0, 1);
	return { street, numbers };
}

/** The pick's areas: its district, and the barri in parentheses ("Sants-Montjuïc (Poble Sec)"). */
function pickAreas(row: PickRow): string[] {
	const inner = row.district.match(/\((.*?)\)/)?.[1];
	const outer = row.district.replace(/\(.*?\)/g, '');
	return [outer, inner].filter((a): a is string => !!a?.trim()).map(areaKey);
}

function inArea(place: Candidate, areas: string[]): boolean {
	const own = [place.district, place.barri].filter((a): a is string => !!a).map(areaKey);
	return areas.some((area) => own.includes(area));
}

/** The name without spaces: "The Miners" and "Theminers" both give "miners". */
function nameKey(name: string): string {
	return nameWords(name).join('').replace(/^the/, '');
}

/**
 * Places whose name is the pick's name, or the start of it ("Federal" for "Federal Café
 * Gòtic"), compared without spaces; at least 4 letters, so "On Café" never matches "On y va".
 */
export function nameCandidates(row: PickRow, places: Candidate[]): Candidate[] {
	const pick = nameKey(row.name);
	return places.filter((place) => {
		const own = nameKey(place.name);
		const short = own.length < pick.length ? own : pick;
		return short.length >= 4 && (pick.startsWith(own) || own.startsWith(pick));
	});
}

/** Same first word of at least 4 letters ("Hidden Coffee BCN" for "Hidden Coffee Roasters El Born"). */
function similarName(row: PickRow, place: Candidate): boolean {
	const first = nameWords(row.name)[0];
	return !!first && first.length >= 4 && nameWords(place.name)[0] === first;
}

function isChain(row: PickRow): boolean {
	const name = nameWords(row.name).join(' ');
	return CHAINS.some((chain) => name === chain || name.startsWith(`${chain} `));
}

function sameAddress(
	place: Candidate,
	address: ReturnType<typeof parseAddress>
): 'full' | 'street' | 'no' {
	const own = parseAddress(place.address);
	if (!address || !own || own.street !== address.street) return 'no';
	if (!own.numbers.length || !address.numbers.length) return 'street';
	return own.numbers.some((n) => address.numbers.includes(n)) ? 'full' : 'no';
}

export function matchPick(row: PickRow, places: Candidate[]): Match {
	const areas = pickAreas(row);
	const address = parseAddress(row.address);
	const byName = nameCandidates(row, places);

	if (row.choose_branch) {
		const branches = byName.filter((place) => inArea(place, areas));
		return branches.length
			? { kind: 'ambiguous', candidates: branches, why: 'branch to choose' }
			: { kind: 'not_found', why: `no branch in ${row.district}` };
	}

	const full = byName.filter((place) => sameAddress(place, address) === 'full');
	if (full.length === 1) return { kind: 'certain', place: full[0]!, why: 'name + address' };

	const street = byName.filter((place) => sameAddress(place, address) === 'street');
	if (!full.length && street.length === 1 && inArea(street[0]!, areas)) {
		return { kind: 'certain', place: street[0]!, why: 'name + street (no number in OSM)' };
	}

	const local = byName.filter((place) => inArea(place, areas));
	// The words after the brand ("Gòtic", "Poblenou"), all of them in the barri's name.
	const hinted = local.filter((place) => {
		const extra = nameWords(row.name).slice(nameWords(place.name).length);
		const barri = place.barri ? words(place.barri) : [];
		const named = extra.filter((w) => w.length > 2);
		return named.length > 0 && named.every((w) => barri.includes(w));
	});
	if (!full.length && hinted.length === 1) {
		return { kind: 'certain', place: hinted[0]!, why: 'name + barri' };
	}

	// The same name, a single place with it in the whole city, in the pick's district.
	const exact = byName.filter((place) => nameKey(place.name) === nameKey(row.name));
	if (
		!full.length &&
		!isChain(row) &&
		exact.length === 1 &&
		byName.length === 1 &&
		inArea(exact[0]!, areas)
	) {
		return {
			kind: 'certain',
			place: exact[0]!,
			why: 'same name, only one in the city (no address in OSM)'
		};
	}

	// Everything else is the founder's call: the name candidates (in the district first), and
	// places at the same address whatever their name, and without any, the same first word.
	const shown = new Map<string, Candidate>();
	const add = (list: Candidate[]) => list.forEach((place) => shown.set(place.slug, place));
	add(full);
	add(local.length ? local : byName);
	add(places.filter((place) => sameAddress(place, address) === 'full'));
	if (!byName.length) add(places.filter((place) => similarName(row, place)));
	if (!shown.size) return { kind: 'not_found', why: 'no place with this name or at this address' };
	const why = full.length
		? 'several at this address'
		: !byName.length
			? 'other name at this address or similar name'
			: isChain(row)
				? 'chain: no branch at this address in OSM'
				: local.length
					? 'name not exact, or several in the district'
					: 'name found, but not in this district';
	return { kind: 'ambiguous', candidates: [...shown.values()], why };
}
