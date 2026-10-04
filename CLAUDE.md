# CLAUDE.md — Out of Office (nome provvisorio)

Web app mobile-first per trovare caffè dove si lavora bene da remoto, con dati della community.
Città di lancio: Barcellona, ma il prodotto è multi-città fin dal primo giorno.
Il fondatore non scrive codice: spiega le scelte in modo semplice, in italiano. Codice, commenti, nomi e testi dell'interfaccia in inglese.

Dettagli di prodotto (leggili quando servono, non tutti a ogni sessione):
- `docs/contesto-progetto.md` — visione, scope MVP, schema dati, piattaforma
- `docs/certificazione.md` — criteri, soglie, revoca, testo della pagina /about
- `docs/design-ux.md` — decisioni di design, palette, componenti, flussi
- `design/mockups/*.dc.html` — mockup definitivi (tema Latte), una schermata per file; indice in `design/README.md`

## Regole di copy (non negoziabili)
- La parola **"nomad"/"nomads" non compare mai** nell'interfaccia, nei metadati, negli store o nel codice visibile all'utente.
- Chi usa e contribuisce si chiama **"users"** (es. "Confirmed by 12 users", "2 of 10 users to get certified").
- Badge: **"Certified for remote work"**.
- Nome dell'app solo da `src/lib/config.ts` (`APP_NAME = 'Out of Office'`): è provvisorio, non scriverlo a mano altrove.
- Nome città e quartieri sono dati: nei testi usa variabili (`{city}`), mai "Barcelona" scritto nel copy.
- Tutti i testi dell'interfaccia in un unico modulo (`src/lib/copy.ts`), per poterli rivedere e tradurre in futuro.

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
| Font | Geist (titoli 800, tracking stretto) e Geist Mono (numeri, freschezza), **self-hosted** in woff2 (niente Google Fonts: GDPR e funzionamento offline in app) |
| Più avanti, non ora | Cloudflare Turnstile, PostHog (UE, senza cookie), Sentry |

Costo obiettivo: zero. Usa solo piani gratuiti che permettono l'uso commerciale. Non aggiungere servizi a pagamento o dipendenze pesanti senza chiedere.

## Architettura: costruire pensando all'app
La stessa base di codice produce due build: web (SSR per la SEO) e app (statica, impacchettata con Capacitor). Quindi:
- `BUILD_TARGET=web|app` sceglie l'adapter in `vite.config.ts` (SvelteKit 3: niente `svelte.config.js`, la configurazione di Kit sta nel plugin `sveltekit()`).
- I file condivisi si importano con `#lib/...` (non `$lib`), con l'estensione per i moduli TS (es. `#lib/copy.ts`).
- **I dati passano dal client Supabase** (`supabase-js` con chiave anon + RLS), che è la nostra "API separata": funziona uguale nel browser, nel server e nell'app.
- Per caricare i dati usa load **universali** (`+page.ts`), non `+page.server.ts`. `+page.server.ts`, form actions ed endpoint server solo per cose solo-web (sitemap, robots, immagini Open Graph).
- La logica di dominio (score, Wilson, livello del locale, certificazione, revoca, anti-manipolazione) sta **nel database** come funzioni SQL, viste e job pg_cron, non nel frontend.
- Geolocalizzazione, fotocamera/upload, condivisione e apertura di app esterne passano da adattatori in `src/lib/platform/` (oggi API del browser, domani plugin Capacitor). Nessun componente le chiama direttamente.
- La mappa è incapsulata in `src/lib/map/`: il resto dell'app non importa MapLibre (piano B futuro: Apple MapKit JS).
- Login (Google + magic link) con redirect URL configurabili, pronti per deep link.
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
Stato live, filtro Wi‑Fi, filtro "open now", stelle, recensioni testuali, loyalty, locali promossi, notifiche/banner di prossimità, altre lingue, foto da Google o da altri siti (mai scraping).

## Design
- Riproduci i mockup in `design/mockups/` (si parte dalla Home). I token stanno nel blocco `.t{...}` di ogni file: portali in `src/lib/styles/tokens.css`.
- Palette: Milk #FAF7F3 · Espresso #1F1712 · Crema #C8894A (**solo** per i certificati) · Roast #6B5D53 · Foam #F3ECE4 · Map #F2EDE6 · icone #9C6230 · distruttivo #9B2C1F.
- Pulsante primario espresso 56 px, raggio 16. Aree di tocco ≥44 px. Mobile-first; desktop = lista a sinistra, mappa a destra.
- Offline e caricamento: righe "fantasma" e messaggio "You're offline", con gli stili esistenti.

## Dati OSM
- `scripts/import-osm.ts --city <slug>`: Overpass API, `amenity=cafe` + `amenity=bar` (niente pub e ristoranti), upsert per osm_id.
- Un locale che sparisce da OSM non si cancella: si imposta `osm_missing_since` e si conservano i contributi.

## Modo di lavorare
- **Plan mode** prima di ogni feature non banale; aspetta l'ok del fondatore prima di implementare.
- Una feature per sessione, **un commit per feature** (messaggi in inglese, stile conventional commits).
- Ogni modifica allo schema = nuova migrazione in `supabase/migrations/` (mai modificare quelle già applicate) + seed aggiornato, applicata al progetto di sviluppo con `npx supabase db push`. Mai modifiche allo schema a mano dalla dashboard.
- Chiavi e segreti solo in `.env` (mai nel repository); tieni aggiornato `.env.example`.
- `npm run gen` rigenera i tipi Cloudflare (`worker-configuration.d.ts`): lancialo quando cambia `wrangler.jsonc`.
- `CLAUDE.md`, `docs/` e `design/` sono esclusi da Prettier (`.prettierignore`): non riformattarli.
- Dopo ogni feature: `npm run check` e `npm run lint` senza errori; spiega in 3-5 righe come provarla nel browser.
- Se una decisione di prodotto non è in questi documenti, chiedi invece di inventarla.

## Ordine delle feature
1. Scheletro SvelteKit, doppia build web/app, token, font, layout base
2. Supabase (progetto di sviluppo): schema, RLS, seed della città Barcellona
3. Import OSM di Barcellona
4. Home mappa con i tre tipi di pin + geolocalizzazione con fallback
5. Lista bottom sheet (Nearest / Top rated) + filtro Certified
6. Anteprima al tap e scheda `/{city}/{place}` (SSR)
7. Flusso di contributo + login + check-in + upload foto
8. Funzioni SQL: score, Wilson, livelli, certificazione automatica e revoca (pg_cron)
9. Admin: Reports, New places, certificazione manuale, nuovi certificati automatici
10. /about, /me (con eliminazione account), /add, "Not in {city} yet", /privacy, /terms, stati vuoti ed errori
