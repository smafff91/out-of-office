/**
 * Shared helpers for the i18n scripts: read messages/*.json and messages/review.json, and
 * flatten each message into comparable variants.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MESSAGES_DIR = 'messages';
export const SOURCE_LOCALE = 'en';
export const TRANSLATED_LOCALES = ['es', 'ca'] as const;
export const REVIEW_FILE = path.join(MESSAGES_DIR, 'review.json');

export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number];

type Variant = { declarations?: string[]; selectors?: string[]; match: Record<string, string> };
export type Message = string | Variant[];
export type Messages = Record<string, Message>;

/**
 * Approved translations, per locale and key: the English source and the translation as they were
 * when a reviewer approved them. If either changes later, the key is back to "to review".
 */
export type ReviewFile = Record<TranslatedLocale, Record<string, { en: string; text: string }>>;

export async function readMessages(locale: string): Promise<Messages> {
	const file = path.join(MESSAGES_DIR, `${locale}.json`);
	const messages = JSON.parse(await readFile(file, 'utf8')) as Messages;
	delete messages.$schema;
	return messages;
}

export async function readReview(): Promise<ReviewFile> {
	const review = JSON.parse(await readFile(REVIEW_FILE, 'utf8')) as Partial<ReviewFile>;
	return { es: review.es ?? {}, ca: review.ca ?? {} };
}

export async function writeReview(review: ReviewFile) {
	await writeFile(REVIEW_FILE, `${JSON.stringify(review, null, '\t')}\n`);
}

/** One comparable string per message, used to detect changes since approval. */
export function fingerprint(message: Message | undefined): string {
	return message === undefined
		? ''
		: typeof message === 'string'
			? message
			: JSON.stringify(message);
}

/** Plain text per variant: "" for a simple message, the match key (e.g. "countPlural=one") otherwise. */
export function variants(message: Message): [string, string][] {
	if (typeof message === 'string') return [['', message]];
	return message.flatMap((variant) => Object.entries(variant.match));
}

/** Variables a message expects from the code (`input` declarations or `{name}` placeholders). */
export function inputs(message: Message): Set<string> {
	if (typeof message !== 'string') {
		const declared = message.flatMap((variant) =>
			(variant.declarations ?? [])
				.filter((line) => line.startsWith('input '))
				.map((line) => line.slice('input '.length).trim())
		);
		return new Set(declared);
	}
	return placeholders(message);
}

/** Every `{name}` used in the text of any variant. */
export function placeholders(message: Message): Set<string> {
	const names = variants(message).flatMap(([, text]) =>
		[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1])
	);
	return new Set(names);
}

export function isApproved(
	review: ReviewFile,
	locale: TranslatedLocale,
	key: string,
	source: Message,
	translation: Message | undefined
): boolean {
	const approved = review[locale][key];
	return (
		approved !== undefined &&
		approved.en === fingerprint(source) &&
		approved.text === fingerprint(translation)
	);
}
