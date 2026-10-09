/**
 * Writes the reviewers' table: one row per text, English source next to the es/ca drafts.
 *
 *   npm run i18n:export
 *
 * Output: docs/translations/translations.csv (UTF-8 with BOM, opens in Excel, Numbers and
 * Google Sheets). Plural forms get one row each, e.g. "place_votes [countPlural=one]".
 * The CSV is read-only for reviewers: corrections go back into messages/*.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	SOURCE_LOCALE,
	TRANSLATED_LOCALES,
	isApproved,
	readMessages,
	readReview,
	variants,
	type Message,
	type Messages
} from './i18n-messages.ts';

const OUTPUT = path.join('docs', 'translations', 'translations.csv');

const source = await readMessages(SOURCE_LOCALE);
const review = await readReview();
const translated = Object.fromEntries(
	await Promise.all(TRANSLATED_LOCALES.map(async (locale) => [locale, await readMessages(locale)]))
) as Record<(typeof TRANSLATED_LOCALES)[number], Messages>;

const variantText = (message: Message | undefined, variant: string) =>
	message === undefined ? '' : (variants(message).find(([name]) => name === variant)?.[1] ?? '');

const header = [
	'key',
	'en',
	...TRANSLATED_LOCALES.flatMap((locale) => [locale, `${locale}_status`])
];
const rows: string[][] = [header];

for (const [key, message] of Object.entries(source)) {
	const names = new Set(variants(message).map(([name]) => name));
	for (const locale of TRANSLATED_LOCALES) {
		const translation = translated[locale][key];
		if (translation !== undefined) for (const [name] of variants(translation)) names.add(name);
	}

	for (const name of names) {
		rows.push([
			name ? `${key} [${name}]` : key,
			variantText(message, name),
			...TRANSLATED_LOCALES.flatMap((locale) => {
				const translation = translated[locale][key];
				const approved = isApproved(review, locale, key, message, translation);
				return [variantText(translation, name), approved ? 'ok' : 'to review'];
			})
		]);
	}
}

const csvCell = (value: string) =>
	/[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

await mkdir(path.dirname(OUTPUT), { recursive: true });
const BOM = '\uFEFF'; // tells Excel the file is UTF-8
await writeFile(OUTPUT, `${BOM}${csv}\r\n`);
console.log(`✔ ${rows.length - 1} rows written to ${OUTPUT}`);
