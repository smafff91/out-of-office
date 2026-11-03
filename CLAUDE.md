# CLAUDE.md — Out of Office (nome provvisorio)

Web app mobile-first per trovare caffè dove si lavora bene da remoto, con dati della community.
Città di lancio: Barcellona, ma il prodotto è multi-città fin dal primo giorno.
Il fondatore non scrive codice: spiega le scelte in modo semplice, in italiano. Codice, commenti e nomi in inglese. L'app è in **inglese, spagnolo e catalano** fin dal lancio: i testi si scrivono in inglese (lingua sorgente) e si traducono in ES e CA.

Dettagli di prodotto (leggili quando servono, non tutti a ogni sessione):
- `docs/contesto-progetto.md` — visione, scope MVP, schema dati, piattaforma
- `docs/certificazione.md` — criteri, soglie, revoca, testo della pagina /about
- `docs/design-ux.md` — decisioni di design, palette, componenti, flussi
- `design/mockups/*.dc.html` — mockup definitivi (tema Latte), una schermata per file; indice in `design/README.md`

## Regole di copy (non negoziabili)
- La parola **"nomad"/"nomads" non compare mai** nell'interfaccia, nei metadati, negli store o nel codice visibile all'utente, in nessuna lingua (né "nómada", né "nòmada").
- Chi usa e contribuisce si chiama **"users"** (es. "Confirmed by 12 users", "2 of 10 users to get certified"); in ES "usuarios", in CA "usuaris".
- Badge: **"Certified for remote work"**.
- Nome dell'app solo da `src/lib/config.ts` (`APP_NAME = 'Out of Office'`): è provvisorio, non scriverlo a mano altrove.
- Nome città e quartieri sono dati: nei testi usa variabili (`{city}`), mai "Barcelona" scritto nel copy.
- **Inglese americano** nei testi sorgente (`messages/en.json`), nei commenti e nei nomi del codice (es. colors, favorites, neighborhood, center).

## Lingue (i18n)
- **Nessun testo dell'interfaccia scritto nel codice.** Ogni testo è una chiave in `messages/en.json` (sorgente), `messages/es.json` e `messages/ca.json` (Paraglide JS 2, formato inlang). Nei componenti: `import * as m from '#lib/paraglide/messages.js'` e `m.place_votes({ count })`.
- Chiavi in snake_case con prefisso per area (`common_`, `place_`, `city_`, `action_`…). Variabili come `{city}`; plurali con `plural` nel file di lingua, mai `count === 1 ? … : …` nel codice.
- Numeri, percentuali, date e "3 days ago" fuori dalle frasi: `#lib/i18n/format.ts` (Intl nella lingua attiva).
- Ogni chiave nuova va in tutte e tre le lingue: ES e CA sono bozze finché un revisore non le approva (il catalano lo rivede un madrelingua). Le approvazioni stanno in `messages/review.json` (`npm run i18n:approve -- --locale ca --keys a,b`); se cambia il testo inglese o la traduzione, la chiave torna "da rivedere" da sola.
- `npm run check:i18n` (incluso in `npm run lint`) blocca chiavi mancanti o in più, variabili diverse dalla sorgente e "nomad" in ogni lingua. `npm run i18n:export` rigenera `docs/translations/translations.csv` per i revisori.
- Scelta della lingua, senza prefissi negli URL: scelta salvata (cookie `locale` + localStorage) → lingua del browser → inglese. Server: middleware Paraglide in `src/hooks.server.ts`, che scrive `<html lang>` e manda `Vary: Cookie, Accept-Language` + `Cache-Control: private, no-cache` sulle pagine HTML. Browser e build app: `src/lib/i18n/locale.ts`. Opzioni del compilatore in `project.inlang/paraglide.config.js`.
- URL per lingua (`/es/`, `/ca/`, hreflang) più avanti: i link interni passano già da `localizeHref` (`#lib/i18n/locale.ts`).
- Selettore lingua: le lingue sono dati. L'elenco nasce dalle lingue compilate da Paraglide con `Intl.DisplayNames` (nome nativo + nome nella lingua attuale; ripiego: codice in maiuscolo) in `#lib/i18n/language-list.ts`: fino a 6 lingue elenco unico, oltre "Suggested" (browser + `cities.languages`) e "All languages", oltre 10 ricerca. Telefono: riga Language nell'AccountSheet; desktop: globo nella barra.
- Il cambio lingua ricarica la stessa pagina e rimette tutto com'era: prima di ricaricare, `onBeforeLeave` salva lo schermo della città (`#lib/places/view-state.ts`: centro e zoom della mappa, pannello, ordinamento, filtro, anteprima, scorrimento) e le bozze; dopo il ricaricamento si ripristinano una volta (scadono dopo 5 minuti). Un componente nuovo con stato da conservare registra il suo `onBeforeLeave`.
- Lingua del profilo: vince l'ultima scelta esplicita (orario in localStorage e `profiles.locale_chosen_at`, `#lib/i18n/locale-sync.ts`).
- Non si traducono: nomi dei locali, contenuti degli utenti, nomi delle lingue nel selettore, `APP_NAME`.
- Email di login: le invia la Edge Function `supabase/functions/send-email` (Send Email Hook di Supabase Auth, firma Standard Webhooks) tramite l'API di Resend, **nella lingua della pagina** da cui si chiede il codice: il client la mette in `lang` dell'URL di ritorno (`buildReturnUrl`); ripiego sulla lingua del profilo (metadati dell'utente, copiati da `profiles.locale` dal trigger `sync_profile_locale`), poi inglese. Testi da `npm run email:build` (chiavi `email_signin_*`) in `copy.gen.ts`, con lo stesso layout (`render.ts`) dei modelli Go di ripiego in `supabase/templates/` (usati solo con l'hook spento); `npm run lint` controlla che siano aggiornati. Dopo un cambio dei testi: deploy della funzione (e `config push` per i modelli). Deploy, segreti (`npm run functions:secrets`) e `config push` li lancia il fondatore.
- Il plugin dei messaggi di inlang è una dipendenza npm a versione fissa, referenziata in locale in `project.inlang/settings.json`: la build non scarica nulla da CDN.

## Stack
| Pezzo | Scelta |
|---|---|
| Framework | SvelteKit + Svelte 5 (runes), TypeScript strict |
| Hosting | Cloudflare (`@sveltejs/adapter-cloudflare`) |
| App nativa (dopo il lancio) | Capacitor sulla build statica (`@sveltejs/adapter-static`, fallback SPA) |
| Database, auth, storage, API | Supabase: Postgres + PostGIS, RLS, Storage, pg_cron. Sviluppo su un progetto **Supabase Free online** dedicato (niente Docker sul Mac); CLI `supabase` in devDependencies a **versione esatta** (oggi 3.0.0), lanciata con `npx supabase`: si aggiorna solo di proposito, dopo aver letto le note di rilascio. La CLI 3 chiede conferma per ogni SQL non di sola lettura: `--read-only` per le letture, `--yes` solo per i test in transazioni annullate sul progetto di sviluppo |
| Mappa | MapLibre GL JS + OpenFreeMap (stile Positron modificato: niente POI, colori Latte) |
| Email di login | Resend (API) dalla Edge Function del Send Email Hook; Resend SMTP come ripiego. In sviluppo mittente `onboarding@resend.dev`, che consegna solo all'indirizzo dell'account Resend |
| Stile | CSS semplice con variabili (design token) + stili scoped di Svelte. Niente Tailwind né librerie UI |
| i18n | Paraglide JS 2 (EN sorgente, ES, CA), compilato da Vite in `src/lib/paraglide/` (generato, escluso da Git) |
| Font | Geist (titoli 800, tracking stretto) e Geist Mono (numeri, freschezza), **self-hosted** in woff2 (niente Google Fonts: GDPR e funzionamento offline in app) |
| Più avanti, non ora | Cloudflare Turnstile, PostHog (UE, senza cookie), Sentry |

Costo obiettivo: zero. Usa solo piani gratuiti che permettono l'uso commerciale. Non aggiungere servizi a pagamento o dipendenze pesanti senza chiedere.

## Architettura: costruire pensando all'app
La stessa base di codice produce due build: web (SSR per la SEO) e app (statica, impacchettata con Capacitor). Quindi:
- `BUILD_TARGET=web|app` sceglie l'adapter in `vite.config.ts` (SvelteKit 3: niente `svelte.config.js`, la configurazione di Kit sta nel plugin `sveltekit()`).
- I file condivisi si importano con `#lib/...` (non `$lib`), con l'estensione per i moduli TS (es. `#lib/config.ts`).
- **I dati passano dal client Supabase** (`supabase-js` con chiave anon + RLS), che è la nostra "API separata": funziona uguale nel browser, nel server e nell'app.
- Per caricare i dati usa load **universali** (`+page.ts`), non `+page.server.ts`. `+page.server.ts`, form actions ed endpoint server solo per cose solo-web (sitemap, robots, immagini Open Graph).
- La logica di dominio (score, Wilson, livello del locale, certificazione, revoca, anti-manipolazione) sta **nel database** come funzioni SQL, viste e job pg_cron, non nel frontend.
- Geolocalizzazione, fotocamera/upload, condivisione e apertura di app esterne passano da adattatori in `src/lib/platform/` (oggi API del browser, domani plugin Capacitor). Nessun componente le chiama direttamente.
- La mappa è incapsulata in `src/lib/map/`: il resto dell'app non importa MapLibre (piano B futuro: Apple MapKit JS).
- Login (Google + email con codice a 6 cifre e link) con redirect URL configurabili (`PUBLIC_AUTH_REDIRECT_URL` → `/auth/callback?next=…`), pronti per deep link: note per Capacitor in `src/lib/platform/README.md`. Logica in `src/lib/auth/` (`session.svelte.ts`, `openSignIn()`), bozze salvate prima di Google e del cambio lingua con `onBeforeLeave`/`stash` (`handoff.ts`).
- Configurazione di Supabase Auth (URL, Google, OTP, modelli email, SMTP) solo in `supabase/config.toml`, applicata con `npx supabase config push` (prima `npx supabase config diff`): mai a mano dalla dashboard. Segreti Google, Resend e dell'hook in `.env`, letti solo dalla CLI; i segreti della funzione arrivano al progetto con `npm run functions:secrets`, che non stampa mai i valori.
- URL delle schede stabili, futuri universal link.
- Niente localStorage per dati importanti; solo preferenze locali, con try/catch.

## URL
`/` · `/{city}` · `/{city}/{place}` · `/{city}/{place}/update` · `/add` · `/about` · `/me` · `/privacy` · `/terms` · `/admin`
Slug dei locali generati una volta e **salvati**: non cambiano se OSM rinomina il locale.

## Modello dati (sintesi — dettagli in docs/contesto-progetto.md)
- `cities` — slug, nome, centro, bbox/area OSM, attiva sì/no, `certified_filter_default` (filtro Certified acceso all'apertura)
- `places` — city_id (sempre esplicito), osm_type + osm_id, slug, nome, geom (PostGIS), indirizzo, quartiere, opening_hours, telefono, sito, instagram, `internet_access_osm` (mostrato come "unconfirmed"), `osm_missing_since`; certificazione: `cert_origin` (picked/confirmed), `certified_at`, `revoked_at` + `revoked_notice` (riga "Certification removed"), `auto_cert_blocked` (niente certificazione automatica); colonne non leggibili dall'API, solo il mese passa da `place_details`
- `contributions` — user, place, `city_id` (dal locale, via trigger), `would_work_again` bool, wifi (none/slow/fast), outlets (none/a_few/plenty), noise (quiet/noisy), long_stays (welcome/not_really), laptop_rules (+ `time_limit_hours` 1/2/3), extras, nota ≤140 caratteri, `checked_in` bool = verified (**mai coordinate né distanza**), created_at, `superseded_at`/`superseded_by` (storico: nessun contributo si cancella)
- `founding_contributors` — posti numerati per città (`city_id`, `seat`, `user_id` null se l'account è cancellato: il posto resta occupato); limite in `certification_settings.founding_limit`
- `photos` — user, place, contributo d'origine (resta anche se superato), `storage_path` casuale (`<uuid>.webp`, nessun id utente negli URL), `width`/`height`, `status` visible/hidden, `published_at` (null = prenotata, mai pubblica), `terms_version`; cancellate con l'account (file compresi). Viste: `place_photos` (12 più recenti, credito solo con `show_name`, niente id né date), `cover_path` in `place_list_items`, `photo_paths`/`photo_count` in `place_details`
- `place_level_changes` — ogni cambio di livello, pick, rimozione, blocco e sblocco (da, a, origine, motivo, nota del pick, chi: system/command/admin); privata, letta solo dalle funzioni del comando `certify`
- `place_team_info` — informazioni del team su un locale scelto (wifi fast/slow/available, outlets, noise, long_stays, laptop_rules lunch/weekends, extras, nota ≤140, `checked_month`); privata, scritta solo con `set_place_team_info` (chiave segreta o admin). Non è un contributo: mai in score, soglie, revoca, "Shared by", Founding o conteggi. Le viste (`place_details`, `place_list_items`, `place_notes`) la mostrano solo sui locali certificati e attributo per attributo finché la community non risponde (4 attributi principali insieme al primo contributo, regole sui laptop finché nessuno risponde alla domanda, extras chip per chip), con `source: 'team'` e il mese ("From our team · Oct 2026"); nel form precompila (tranne Wi‑Fi `available`)
- `reports`, `city_votes` ("Not in {city} yet"), `profiles` (nome pubblico, `show_name`, lingua, ruolo user/admin)
- Livello derivato del locale: `osm_only` → `community` (≥1 contributo) → `certified`
- Ogni attributo mostrato con **valore prevalente, numero di conferme e data dell'ultima conferma**
- Un solo contributo **attivo** per utente e locale (indice unico parziale): il nuovo sostituisce il precedente, che resta nello storico come superato, a qualunque età; entro 30 giorni il ringraziamento lo dice. Viste pubbliche, conteggi e certificazione leggono solo `counted_contributions` (vista interna, senza grant): contributi attivi di account con email confermata o di account cancellati
- Soglie di certificazione in un'unica tabella di configurazione, non sparse nel codice
- RLS attiva su **ogni** tabella; admin solo via ruolo nel database

## Regole di prodotto da rispettare nel codice
- Score = % di "sì" a "Would you work here again?". Da 5 voti: "94% would work here again"; sotto: "2 of 2"; senza voti: niente score.
- "Top rated" = limite inferiore dell'intervallo di Wilson (z = 1.96). Sezioni: ≥5 voti → "Not enough votes yet" → senza info.
- Ordinamento di default: Nearest. Unico filtro: "Certified for remote work", acceso all'apertura dove `cities.certified_filter_default` (Barcellona sì); la scelta dell'utente resta finché resta nella pagina.
- Check-in verificato solo nel database (`submit_contribution`): distanza ≤ `checkin_radius_m` (100) dal punto del locale e accuratezza dichiarata ≤ `checkin_max_accuracy_m` (100); coordinate mancanti o non valide = non verificato. Il client arrotonda a 4 decimali e le manda solo in POST; la distanza nel form è solo un'anteprima.
- Contributi solo tramite l'RPC `submit_contribution` (nessun accesso diretto alla tabella): account con email confermata, `daily_contribution_limit` (20) nelle ultime 24 ore, livello ricalcolato nella stessa transazione (`recompute_place_certification`), badge Founding ai primi `founding_limit` (50) utenti per città al loro primo contributo (lock per città + vincoli). Precompilazione con `my_recent_contribution`.
- Certificazione (Picked / Confirmed), revoca, blocco e riga "Certification removed": esattamente come in `docs/certificazione.md`, nel database (`certification_check`, `revocation_check`, `recompute_place_certification`, job pg_cron giornaliero `certification-daily`). Il team agisce da Terminale: `npm run certify -- --pick <city>/<place> --note "…" | --unpick <city>/<place> --reason "…" [--block] [--no-notice] | --unblock <city>/<place> --reason "…" | --pick-file <file> [--dry-run] | --list | --recent | --due | --recompute <city>` (produzione: `npm run certify:prod -- …`). Caricamento in blocco: un file in `data/picks/` (formato in `scripts/pick-file.ts`), abbinato agli slug con `npm run picks:match -- --file <file>` (solo lettura, chiave pubblica; i casi ambigui li sceglie il fondatore), poi `--pick-file` (una sola conferma, mese del file come data del pick, informazioni del team); le funzioni (`pick_place`, `unpick_place`, `unblock_place`, `set_place_team_info`, `certification_*`) accettano la chiave segreta o un admin, pronte per la feature 9.
- Login richiesto solo all'invio del contributo, senza perdere i dati già inseriti.
- Foto (`src/lib/photos/`): alla scelta il browser fa due WebP, 1200 px (≤ 900 KB) e 400 px (≤ 140 KB), dritti e **senza metadati** (canvas + `stripWebpMetadata`); mai un canvas oltre 16,7 milioni di pixel (limite di Safari); HEIC con `heic-to` (LGPL-3.0) e WebP su Safari con `@jsquash/webp` (Apache-2.0), caricati solo quando servono. Bozza delle foto in IndexedDB (`stored-photos.ts`). Massimo 3 per contributo e 15 al giorno, e al massimo 3 foto visibili per utente per locale: alla pubblicazione le nuove sostituiscono le sue più vecchie lì (le `hidden` non contano e non si cancellano; nel form la riga "Your new photos will replace…" con `my_place_photo_count`). Limiti in `certification_settings`, applicati nel database.
- Caricamento solo dopo `submit_contribution`: `reserve_photo` (nome casuale + limiti) → due file nei bucket `place-photos` (1 MiB) e `place-photo-thumbs` (150 KiB), solo WebP, solo un nome prenotato da te (regole su `storage.objects`) → `publish_photo`. Un caricamento fallito non tocca il contributo ("Try again" nel ringraziamento).
- I file non si cancellano in SQL: ogni riga di `photos` cancellata (utente con `delete_my_photo`, moderazione, account, prenotazione scaduta dopo 24 ore) mette i due file in `storage_deletions`, svuotata dalla Edge Function `storage-cleanup` (pg_cron ogni 10 minuti, solo se la coda non è vuota, segreto condiviso nel Vault). Cache dei file 1 ora: sul piano Free la CDN serve i file in cache fino alla scadenza.
- Moderazione da Terminale: `npm run photos -- --list <city>/<place> | --hide <id> | --show <id> | --remove <id>` (produzione: `npm run photos:prod -- …`). La versione dei Termini accettata è `TERMS_VERSION` in `src/lib/config.ts`: va cambiata quando cambiano i Termini.
- Attribuzione "© OpenStreetMap contributors" sempre visibile sulla mappa.

## Fuori dall'MVP (non implementare)
Stato live, filtro Wi‑Fi, filtro "open now", stelle, recensioni testuali, loyalty, locali promossi, notifiche/banner di prossimità, lingue oltre a EN/ES/CA, foto da Google o da altri siti (mai scraping).

## Design
- Riproduci i mockup in `design/mockups/` (si parte dalla Home). I token stanno nel blocco `.t{...}` di ogni file: portali in `src/lib/styles/tokens.css`.
- Palette: Milk #FAF7F3 · Espresso #1F1712 · Crema #C8894A (**solo** per i certificati) · Roast #6B5D53 · Foam #F3ECE4 · Map #F2EDE6 · icone #9C6230 · distruttivo #9B2C1F.
- Pulsante primario espresso 56 px, raggio 16. Aree di tocco ≥44 px: gli elementi toccabili disegnati più piccoli usano la classe globale `.tap-target` (estensione invisibile). Mobile-first; desktop = lista a sinistra, mappa a destra.
- Offline e caricamento: righe "fantasma" e messaggio "You're offline", con gli stili esistenti.

## Dati OSM
- `scripts/import-osm.ts --city <slug>`: Overpass API, `amenity=cafe` + `amenity=bar` (niente pub e ristoranti), upsert per osm_id.
- Un locale che sparisce da OSM non si cancella: si imposta `osm_missing_since` e si conservano i contributi.
- Si lancia con `npm run import:osm -- --city <slug> [--dry-run] [--from-cache]`; la risposta grezza resta in `.cache/osm/` (esclusa da Git). Quartieri: tabella `neighborhoods` (distretti e barri dai confini OSM, `short_name` compilato a mano), assegnati in SQL. Slug dei nuovi locali: nome → nome + barri (nome ufficiale) → nome + via → nome + numero.
- Lo script scrive con `SUPABASE_SECRET_KEY` (ruolo `service_role`, con grant minimi dati dalle migrazioni): **solo in `scripts/`**, mai con prefisso `PUBLIC_`, mai letta da `src/` (regola ESLint). Dopo una build, `npm run check:secrets`.

## Modo di lavorare
- **Plan mode** prima di ogni feature non banale; aspetta l'ok del fondatore prima di implementare.
- Una feature per sessione, **un commit per feature** (messaggi in inglese, stile conventional commits).
- Ogni modifica allo schema = nuova migrazione in `supabase/migrations/` (mai modificare quelle già applicate) + seed aggiornato, applicata al progetto di sviluppo con `npx supabase db push --remote --include-seed` (chiede la password del database: lo lancia il fondatore nel suo terminale). Mai modifiche allo schema a mano dalla dashboard.
  - Il nome di una migrazione nuova (`AAAAMMGGhhmmss_nome.sql`) va **dopo l'ultima esistente** (oggi `20261103120000`), non con la data del giorno: una migrazione con un orario precedente all'ultima applicata viene rifiutata da `db push`.
- Dopo ogni migrazione: `npm run db:types` rigenera `src/lib/supabase/database.types.ts`. Per query di verifica sul progetto di sviluppo: `npx supabase db query --remote --read-only` (niente password).
- `npx supabase db query --remote` solo per letture (`--read-only`) o per test dentro transazioni annullate; ogni modifica a schema, permessi o dati di configurazione passa da una migrazione. Mai collegare questa cartella al progetto di produzione.
  - Unica eccezione: i file in `supabase/dev/` (permessi solo per i dati di prova, mai in produzione), applicati solo con `npm run dev:grants`, che si rifiuta di partire se il progetto collegato non è `DEV_PROJECT_REF`.
- L'esposizione automatica delle tabelle è disattivata: ogni migrazione concede i permessi (`grant`) ad `anon` e `authenticated` in modo esplicito, e attiva la RLS.
- La tabella `contributions` non è leggibile né scrivibile dal client (nemmeno le proprie righe): si scrive solo con `submit_contribution`, la scheda usa le viste aggregate `place_details`, `place_scores`, `place_attributes`, `place_laptop_rules`, `place_notes`, `place_contributors`.
- `profiles` è privata (ognuno legge e modifica solo la propria riga; update solo di `display_name`, `show_name`, `locale`). I nomi pubblici passano solo da `place_contributors` (`place_id`, `display_name`, se `show_name` è true): **mai un nome insieme a una data o a un identificativo**; `place_notes` non ha autore e ha solo il mese (`created_month`). `npm run test:db` lo verifica con la chiave pubblica; `supabase/tests/profile_visibility.sql` (transazione annullata) controlla RLS, trigger ed eliminazione.
- Chiavi e segreti solo in `.env` (mai nel repository); tieni aggiornato `.env.example`.
- Variabili d'ambiente dichiarate in `src/env.ts` (SvelteKit 3) e importate da `$app/env/public`; il client è `createSupabaseClient(fetch)` in `#lib/supabase/client.ts`.
- Mappa: lo stile sta in `src/lib/map/style.json`, generato da `npm run map:style` (Positron di OpenFreeMap senza POI, colori Latte) e salvato nel repository; MapLibre si importa solo in `src/lib/map/engine.ts`, caricato dopo la pagina.
- Dati di prova solo nel progetto di sviluppo: prima `npm run dev:grants`, poi `npm run dev:fixtures -- --city <slug>` (locali community/certificati e contributi anonimi; `--remove` toglie tutto); serve `DEV_PROJECT_REF` in `.env`, altrimenti gli script si rifiutano. `npm run dev:founding -- --city <slug> --reset` libera i posti Founding assegnati durante le prove.
- Test: `npm test` (vitest) per la logica pura in `src/lib/` (orari, ricerca, distanze, ordinamento, login, bozza del contributo, foto: dimensioni, metadati, caricamento). `npm run test:db` (rete, migrazione applicata, `npm run dev:grants`, progetto collegato = sviluppo): viste pubbliche con la chiave pubblica, i test SQL di `supabase/tests/` in transazioni annullate (regole dei contributi, profili, foto), gli invii simultanei per i posti Founding e i file delle foto (regole dei bucket, pubblicazione, cancellazione con l'account) con città e utenti di prova temporanei, creati e cancellati con la chiave segreta.
- `npm run gen` rigenera i tipi Cloudflare (`worker-configuration.d.ts`): lancialo quando cambia `wrangler.jsonc`.
- `CLAUDE.md`, `docs/` e `design/` sono esclusi da Prettier (`.prettierignore`): non riformattarli.
- Dopo ogni feature: `npm test`, `npm run check` e `npm run lint` senza errori; spiega in 3-5 righe come provarla nel browser.
- Se una decisione di prodotto non è in questi documenti, chiedi invece di inventarla.

## Ordine delle feature
1. Scheletro SvelteKit, doppia build web/app, token, font, layout base
2. Supabase (progetto di sviluppo): schema, RLS, seed della città Barcellona
3. Import OSM di Barcellona
3b. i18n: EN/ES/CA con Paraglide, file di lingua, controllo chiavi, CSV per i revisori
4. Home mappa con i tre tipi di pin + geolocalizzazione con fallback
5. Lista bottom sheet (Nearest / Top rated) + filtro Certified + ricerca (per nome del locale e per barri) + layout desktop come LatteDesktop: barra in alto completa, lista a sinistra, mappa a destra
6. Anteprima al tap e scheda `/{city}/{place}` (SSR)
7. Flusso di contributo + login + check-in + upload foto
8. Funzioni SQL: score, Wilson, livelli, certificazione automatica e revoca (pg_cron)
9. Admin: Reports, New places, certificazione manuale, nuovi certificati automatici
10. /about, /me (con eliminazione account) + pulsante Account → /me, /add, "Not in {city} yet" completo (nome della città, voto, barra), /privacy, /terms, stati vuoti ed errori

## Feature completate
- [x] 1. Scheletro SvelteKit, doppia build web/app, token, font self-hosted, layout base
- [x] 2. Supabase: schema, RLS su ogni tabella, viste aggregate, seed di Barcellona
- [x] 3. Import OSM (`npm run import:osm`), quartieri e distretti, categoria cafe/bar (`places.amenity`)
- [x] 3b. i18n EN/ES/CA con Paraglide, `check:i18n`, approvazioni in `messages/review.json`, CSV per i revisori
- [x] 4. Home mappa: tre tipi di pin, geolocalizzazione con ripiego (scelta dell'area), "Not in your area"
- [x] 5. Lista bottom sheet (Nearest / Top rated), filtro Certified, ricerca per locale e barri, layout desktop
- [x] 6. Anteprima al tap (telefono) e scheda `/{city}/{place}` con SSR, canonical, JSON-LD, 404 curata; vista `place_details` (solo aggregati); su desktop la scheda sta nel pannello di sinistra (layout `src/routes/[city]/+layout.svelte` condiviso da lista e scheda); galleria foto senza fonte collegata (`src/lib/places/photos.ts`); Directions e Share in `src/lib/platform/`. Disattivati con TODO: "Add your experience" (7), "Report a problem" (9), sigillo → /about (10)

- [x] 7a. Login con Google o email (codice a 6 cifre + link, stessa email in EN/ES/CA), `SignInSheet` riutilizzabile (`openSignIn({ context: 'contribution', onsignedin })` per la 7b) e `SignInForm` dentro l'AccountSheet; guscio modale comune `#lib/components/sheet/Sheet.svelte`; account: AccountSheet sul telefono (Sign in / nome, Language, Sign out), su desktop "Sign in" diretto, globo per la lingua e menu dell'avatar; `NameChoice` + `saveProfile` pronti per la 7b; profili privati e viste `place_contributors`/`place_notes` senza nomi con date; `cities.languages` in `city_summaries`

- [x] 7b. Form di contributo `/{city}/{place}/update` (noindex; su desktop nel pannello di sinistra), "Check in here" e "Add your experience", check-in verificato in PostGIS, login all'invio con bozza conservata (Google, cambio lingua), NameChoice al primo invio, ringraziamento con conferme, Founding contributor e barra di certificazione; RPC `submit_contribution` / `my_recent_contribution`, storico dei contributi, `founding_contributors`; scheda con "Shared by …", dettagli e note. Foto: 7c

- [x] 7c. Foto nel form di contributo (3 per contributo, 15 al giorno), compresse nel browser senza metadati, conservate con la bozza in IndexedDB; caricamento dopo l'invio con "Try again"; galleria della scheda (12, "Photo by {name}"), copertina in lista e anteprima; coda di cancellazione dei file con Edge Function `storage-cleanup` e pg_cron; `delete_my_photo` (per /me, feature 10); moderazione con `npm run photos`; `npm run prod` per la produzione senza collegare la cartella

- [x] 8. Certificazione nel database: due origini dello stesso badge ("Picked by our team · {month}", "Confirmed by N users"), certificazione automatica e revoca come in `docs/certificazione.md` (v3.1), ricalcolo a ogni contributo e ogni notte, transizioni in `place_level_changes`, blocco della certificazione automatica, "Certification removed in {month}" per 90 giorni, comando `npm run certify`, filtro Certified acceso di default (`cities.certified_filter_default`), `counted_contributions` come unica definizione di chi conta
- [x] 8b. Informazioni del team sui Picked (`place_team_info`, "From our team · {month}", precedenza per attributo, precompilazione del form) e caricamento in blocco: `npm run picks:match` e `npm run certify -- --pick-file`; primo file `data/picks/barcelona-picks-2026-10.json` (22 locali con slug)

## Checklist di lancio
- **Produzione senza collegare la cartella** (il collegamento della CLI resta sempre sul progetto di sviluppo, quindi `db query --remote`, `dev:grants` e `test:db` non toccano mai la produzione). In `.env.production` (escluso da Git): `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PROD_PROJECT_REF`, `PROD_DB_URL` (stringa di connessione con password, Dashboard → Connect), i segreti di Google e Resend, `EMAIL_FROM` sul dominio. In `supabase/config.toml` si scommenta `[remotes.production]` con il ref di produzione e gli URL del dominio. Poi, in quest'ordine:
  1. `npm run prod -- db-push` (mostra prima le migrazioni con `--dry-run`, poi chiede di scrivere il ref);
  2. `npm run prod -- config-diff`, poi `npm run prod -- config-push`;
  3. `npm run functions:secrets -- --prod` (segreti di `send-email`), poi `npm run prod -- deploy` (`send-email` e `storage-cleanup`);
  4. `npm run photos:prod -- --setup-cleanup` (segreto della pulizia nel Vault e nella funzione, job pg_cron).
  Prima e dopo: `cat supabase/.temp/project-ref` deve essere il progetto di sviluppo. Se la cartella è finita collegata alla produzione: `npx supabase link --project-ref <DEV_PROJECT_REF>` (gli script si rifiutano di partire finché non è così).
- Termini (/terms): licenza d'uso delle foto caricate, niente volti riconoscibili, e la data in `TERMS_VERSION` (`src/lib/config.ts`) uguale a quella della pagina; la frase sotto la griglia delle foto diventa un link ai Termini. Licenze di `heic-to` (LGPL-3.0) e `@jsquash/webp` (Apache-2.0) citate in /about o in una pagina delle licenze.
- Nessun elemento disattivato (`aria-disabled`) né commento `TODO(feature N)` nell'interfaccia: `grep -rn "aria-disabled\|TODO(feature" src/` deve essere vuoto.
- Email: dominio verificato su Resend con **SPF, DKIM e DMARC**; `EMAIL_FROM` sul dominio (non `onboarding@resend.dev`) nei segreti della funzione e mittente di `[auth.email.smtp]` (ripiego); nel progetto di produzione una chiave Resend con soli permessi di invio e un segreto dell'hook suoi (`npm run functions:secrets`), deploy di `send-email`; `site_url` e `additional_redirect_urls` sul dominio; `[auth.rate_limit] email_sent` adeguato.
- Privacy: Resend tra i fornitori che trattano dati personali (indirizzo email) nella pagina /privacy.
- Founding contributor: se si è provato a contribuire in produzione prima del lancio, azzerare i posti della città (`reset_founding_contributors`, solo `service_role`).
- Google: schermata di consenso pubblicata (non più in modalità test), dominio verificato, URL di redirect di produzione nel client OAuth.
