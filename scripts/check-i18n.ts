/**
 * Checks the translation files against the English source (messages/en.json).
 *
 *   npm run check:i18n
 *
 * Errors (exit 1): keys missing from or extra in es/ca, variables that differ from the source,
 * the banned word "nomad" in any language, approvals in review.json for keys that no longer exist.
 * Warning only: how many es/ca keys are still waiting for review.
 */
import {
	SOURCE_LOCALE,
	TRANSLATED_LOCALES,
	inputs,
	isApproved,
	placeholders,
	readMessages,
	readReview,
	variants,
	type Message
} from './i18n-messages.ts';

// "nomad"/"nomads" never appear in the interface (CLAUDE.md), nor their translations.
const BANNED = /n[oóò]mad/i;

const errors: string[] = [];
const warnings: string[] = [];

const source = await readMessages(SOURCE_LOCALE);
const review = await readReview();

const sameSet = (a: Set<string>, b: Set<string>) =>
	a.size === b.size && [...a].every((x) => b.has(x));
const list = (names: Set<string>) =>
	names.size ? [...names].map((n) => `{${n}}`).join(', ') : 'none';

function checkBanned(locale: string, key: string, message: Message) {
	for (const [, text] of variants(message)) {
		if (BANNED.test(text)) errors.push(`${locale}: "${key}" uses a banned word: ${text}`);
	}
}

for (const [key, message] of Object.entries(source)) checkBanned(SOURCE_LOCALE, key, message);

for (const locale of TRANSLATED_LOCALES) {
	const translated = await readMessages(locale);
	let pending = 0;

	for (const [key, message] of Object.entries(source)) {
		const translation = translated[key];
		if (translation === undefined) {
			errors.push(`${locale}: missing key "${key}"`);
			continue;
		}
		checkBanned(locale, key, translation);

		const expected = inputs(message);
		const actual = inputs(translation);
		if (!sameSet(expected, actual)) {
			errors.push(`${locale}: "${key}" has variables ${list(actual)}, expected ${list(expected)}`);
		}
		if (!sameSet(placeholders(message), placeholders(translation))) {
			errors.push(
				`${locale}: "${key}" shows ${list(placeholders(translation))}, the source shows ${list(placeholders(message))}`
			);
		}

		if (!isApproved(review, locale, key, message, translation)) pending++;
	}

	for (const key of Object.keys(translated)) {
		if (!(key in source))
			errors.push(`${locale}: extra key "${key}" (not in ${SOURCE_LOCALE}.json)`);
	}
	for (const key of Object.keys(review[locale])) {
		if (!(key in source))
			errors.push(`review.json: ${locale} approves "${key}", which no longer exists`);
	}

	if (pending > 0) {
		warnings.push(`${locale}: ${pending} of ${Object.keys(source).length} keys still to review`);
	}
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
if (errors.length > 0) {
	for (const error of errors) console.error(`✖ ${error}`);
	console.error(`\n${errors.length} i18n error(s).`);
	process.exit(1);
}
console.log(`✔ i18n: ${Object.keys(source).length} keys, translations complete.`);
