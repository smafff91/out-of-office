# Translations — reviewer guide

`translations.csv` lists every text of the app: English (source) next to the Spanish and Catalan drafts.
Open it in Excel, Numbers or Google Sheets.

- **key**: the text's name in the code. `[countPlural=one]` / `[countPlural=*]` rows are the singular and plural forms of the same text (`*` = every other number).
- **es_status / ca_status**: `to review` = draft, `ok` = already approved.
- Keep words in braces exactly as they are (`{city}`, `{count}`, `{percent}`…): the app replaces them with real values.
- Tone: informal (tú / tu), Spanish from Spain. Never "nómada" / "nòmada"; people who use the app are "usuarios" / "usuaris".
- Write corrections in a new column (or as comments) and send the file back: they are copied into `messages/es.json` and `messages/ca.json`, then approved.

Regenerate the file with `npm run i18n:export`.
