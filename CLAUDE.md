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
- Lingua del profilo: vince l'ultima scelta esplicita (orario in localStorage e `profiles.locale_chosen_at`, `#lib/i18n/locale-sync.ts`). Limite noto: la prima email di accesso dopo un cambio fatto da disconnessi esce nella lingua del profilo (Supabase usa i metadati salvati).
- Non si traducono: nomi dei locali, contenuti degli utenti, nomi delle lingue nel selettore, `APP_NAME`.
- Email di login: **un solo modello** con condizioni sulla lingua (`{{ if eq .Data.locale "es" }}…`), generato da `npm run email:build` dalle chiavi `email_signin_*` dei file di lingua in `supabase/templates/` e negli oggetti in `supabase/config.toml` (versionati; `npm run lint` controlla che siano aggiornati). La lingua sta nei metadati dell'utente: al primo accesso la manda `signInWithOtp` (`data.locale`), poi il trigger `sync_profile_locale` la copia da `profiles.locale`. Si applica con `npx supabase config push` (lo lancia il fondatore).
- Il plugin dei messaggi di inlang è una dipendenza npm a versione fissa, referenziata in locale in `project.inlang/settings.json`: la build non scarica nulla da CDN.

## Stack
| Pezzo | Scelta |
|---|---|
| Framework | SvelteKit + Svelte 5 (runes), TypeScript strict |
| Hosting | Cloudflare (`@sveltejs/adapter-cloudflare`) |
| App nativa (dopo il lancio) | Capacitor sulla build statica (`@sveltejs/adapter-static`, fallback SPA) |
| Database, auth, storage, API | Supabase: Postgres + PostGIS, RLS, Storage, pg_cron. Sviluppo su un progetto **Supabase Free online** dedicato (niente Docker sul Mac); CLI via `npx supabase` (non installata globalmente) |
| Mappa | MapLibre GL JS + OpenFreeMap (stile Positron modificato: niente POI, colori Latte) |
| Email magic link | Resend come SMTP di Supabase (solo in produzione; in sviluppo bastano le email integrate di Supabase, con i loro limiti) |
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
- Configurazione di Supabase Auth (URL, Google, OTP, modelli email, SMTP) solo in `supabase/config.toml`, applicata con `npx supabase config push` (prima `npx supabase config diff`): mai a mano dalla dashboard. Segreti Google e Resend in `.env`, letti solo dalla CLI.
- URL delle schede stabili, futuri universal link.
- Niente localStorage per dati importanti; solo preferenze locali, con try/catch.

## URL
`/` · `/{city}` · `/{city}/{place}` · `/{city}/{place}/update` · `/add` · `/about` · `/me` · `/privacy` · `/terms` · `/admin`
Slug dei locali generati una volta e **salvati**: non cambiano se OSM rinomina il locale.

## Modello dati (sintesi — dettagli in docs/contesto-progetto.md)
- `cities` — slug, nome, centro, bbox/area OSM, attiva sì/no
- `places` — city_id (sempre esplicito), osm_type + osm_id, slug, nome, geom (PostGIS), indirizzo, quartiere, opening_hours, telefono, sito, instagram, `internet_access_osm` (mostrato come "unconfirmed"), `osm_missing_since`; certificazione: `cert_origin` (manual/community), `certified_at`, `revoked_at`
- `contributions` — user, place, `would_work_again` bool, wifi (none/slow/fast), outlets (none/a_few/plenty), noise (quiet/noisy), long_stays (welcome/not_really), laptop_rules, nota ≤140 caratteri, `checked_in` bool + distanza in metri (**non salvare le coordinate dell'utente**), created_at
- `photos` (storage path, autore, stato moderazione), `reports`, `city_votes` ("Not in {city} yet"), `profiles` (nome pubblico, ruolo user/admin, founding contributor)
- Livello derivato del locale: `osm_only` → `community` (≥1 contributo) → `certified`
- Ogni attributo mostrato con **valore prevalente, numero di conferme e data dell'ultima conferma**
- Un voto per utente per locale ogni 30 giorni: il più recente sostituisce il precedente
- Soglie di certificazione in un'unica tabella di configurazione, non sparse nel codice
- RLS attiva su **ogni** tabella; admin solo via ruolo nel database

## Regole di prodotto da rispettare nel codice
- Score = % di "sì" a "Would you work here again?". Da 5 voti: "94% would work here again"; sotto: "2 of 2"; senza voti: niente score.
- "Top rated" = limite inferiore dell'intervallo di Wilson (z = 1.96). Sezioni: ≥5 voti → "Not enough votes yet" → senza info.
- Ordinamento di default: Nearest. Unico filtro: "Certified for remote work", spento di default.
- Check-in verificato se entro ~100 m dal locale (calcolato in SQL con PostGIS).
- Certificazione automatica e revoca: esattamente come in `docs/certificazione.md`.
- Login richiesto solo all'invio del contributo, senza perdere i dati già inseriti.
- Foto: ridimensiona a 1200 px, WebP, **rimuovi EXIF** nel browser prima dell'upload.
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
- Ogni modifica allo schema = nuova migrazione in `supabase/migrations/` (mai modificare quelle già applicate) + seed aggiornato, applicata al progetto di sviluppo con `npx supabase db push --include-seed` (chiede la password del database: lo lancia il fondatore nel suo terminale). Mai modifiche allo schema a mano dalla dashboard.
- Dopo ogni migrazione: `npm run db:types` rigenera `src/lib/supabase/database.types.ts`. Per query di verifica sul progetto di sviluppo: `npx supabase db query --linked` (niente password).
- `npx supabase db query --linked` solo per letture o per test dentro transazioni annullate; ogni modifica a schema, permessi o dati di configurazione passa da una migrazione. Mai collegare questa cartella al progetto di produzione.
  - Unica eccezione: i file in `supabase/dev/` (permessi solo per i dati di prova, mai in produzione), applicati solo con `npm run dev:grants`, che si rifiuta di partire se il progetto collegato non è `DEV_PROJECT_REF`.
- L'esposizione automatica delle tabelle è disattivata: ogni migrazione concede i permessi (`grant`) ad `anon` e `authenticated` in modo esplicito, e attiva la RLS.
- La tabella `contributions` non è leggibile pubblicamente (solo le proprie righe): la scheda usa le viste aggregate `place_scores`, `place_attributes`, `place_laptop_rules`, `place_notes`.
- `profiles` è privata (ognuno legge e modifica solo la propria riga; update solo di `display_name`, `show_name`, `locale`). I nomi pubblici passano solo da `place_contributors` (`place_id`, `display_name`, se `show_name` è true): **mai un nome insieme a una data o a un identificativo**; `place_notes` non ha autore e ha solo il mese (`created_month`). `npm run test:db` lo verifica con la chiave pubblica; `supabase/tests/profile_visibility.sql` (transazione annullata) controlla RLS, trigger ed eliminazione.
- Chiavi e segreti solo in `.env` (mai nel repository); tieni aggiornato `.env.example`.
- Variabili d'ambiente dichiarate in `src/env.ts` (SvelteKit 3) e importate da `$app/env/public`; il client è `createSupabaseClient(fetch)` in `#lib/supabase/client.ts`.
- Mappa: lo stile sta in `src/lib/map/style.json`, generato da `npm run map:style` (Positron di OpenFreeMap senza POI, colori Latte) e salvato nel repository; MapLibre si importa solo in `src/lib/map/engine.ts`, caricato dopo la pagina.
- Dati di prova solo nel progetto di sviluppo: prima `npm run dev:grants`, poi `npm run dev:fixtures -- --city <slug>` (locali community/certificati e contributi anonimi; `--remove` toglie tutto); serve `DEV_PROJECT_REF` in `.env`, altrimenti gli script si rifiutano.
- Test: `npm test` (vitest) per la logica pura in `src/lib/` (orari, ricerca, distanze, ordinamento, login). `npm run test:db` (rete, migrazione applicata) per le viste pubbliche con la chiave pubblica.
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

## Checklist di lancio
- Nessun elemento disattivato (`aria-disabled`) né commento `TODO(feature N)` nell'interfaccia: `grep -rn "aria-disabled\|TODO(feature" src/` deve essere vuoto.
- Email: **SMTP Resend con SPF e DKIM (e DMARC) sul dominio definitivo** in `[auth.email.smtp]` di `supabase/config.toml` (mittente sul dominio, non `onboarding@resend.dev`); `site_url` e `additional_redirect_urls` sul dominio; `[auth.rate_limit] email_sent` adeguato.
- Google: schermata di consenso pubblicata (non più in modalità test), dominio verificato, URL di redirect di produzione nel client OAuth.
