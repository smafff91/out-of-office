/**
 * Marks translations as reviewed in messages/review.json, after a reviewer has checked them.
 *
 *   npm run i18n:approve -- --locale ca --keys common_account,common_map
 *   npm run i18n:approve -- --locale es --all
 *
 * An approval stores the English source and the translation as they are now: if either changes
 * later, the key goes back to "to review" by itself.
 */
import { parseArgs } from 'node:util';
import {
	SOURCE_LOCALE,
	TRANSLATED_LOCALES,
	fingerprint,
	readMessages,
	readReview,
	writeReview,
	type TranslatedLocale
} from './i18n-messages.ts';

const { values } = parseArgs({
	options: {
		locale: { type: 'string' },
		keys: { type: 'string' },
		all: { type: 'boolean', default: false }
	}
});

const locale = values.locale as TranslatedLocale | undefined;
if (!locale || !TRANSLATED_LOCALES.includes(locale) || (!values.all && !values.keys)) {
	console.error(
		`Usage: npm run i18n:approve -- --locale ${TRANSLATED_LOCALES.join('|')} (--keys a,b | --all)`
	);
	process.exit(1);
}

const source = await readMessages(SOURCE_LOCALE);
const translated = await readMessages(locale);
const keys = values.all ? Object.keys(source) : values.keys!.split(',').map((key) => key.trim());

const review = await readReview();
for (const key of keys) {
	if (!(key in source) || !(key in translated)) {
		console.error(`✖ "${key}" is missing from ${SOURCE_LOCALE}.json or ${locale}.json`);
		process.exit(1);
	}
	review[locale][key] = { en: fingerprint(source[key]), text: fingerprint(translated[key]) };
}

await writeReview(review);
console.log(`✔ ${keys.length} ${locale} key(s) approved`);
