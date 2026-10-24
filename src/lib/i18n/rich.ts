/**
 * Links inside a translated sentence ("By continuing you agree to the {terms} and {privacy}.")
 * without splitting it into fragments: the message is rendered with markers in place of the
 * variables, then cut into text and slot parts that the component renders as links.
 */

export type RichPart = { text: string } | { slot: string };

const OPEN = '';
const CLOSE = '';

export function richParts(render: (slots: Record<string, string>) => string, names: string[]) {
	const markers = Object.fromEntries(names.map((name) => [name, `${OPEN}${name}${CLOSE}`]));
	const parts: RichPart[] = [];
	for (const [i, piece] of render(markers)
		.split(new RegExp(`${OPEN}(\\w+)${CLOSE}`))
		.entries()) {
		if (i % 2 === 1) parts.push({ slot: piece });
		else if (piece) parts.push({ text: piece });
	}
	return parts;
}
