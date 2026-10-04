# Contesto progetto — Cafe List Barcellona

*File di contesto per la knowledge base del progetto. Aggiornare quando vengono prese nuove decisioni.*
*Ultimo aggiornamento: 4 ottobre 2026 (**target = lavoratori da remoto, non solo nomadi; la parola "nomads" non compare mai nell'app; utenti = "users"**). Aggiornamenti precedenti (28 set): visione multi-città, struttura UX, direzione visiva, score "would work here again", tre livelli di informazione, piano app nativa, certificazione v2 a due strade. Dettagli design in `claude/design-ux.md`, certificazione in `claude/certificazione.md`, naming in `claude/naming.md`.*

---

## Concetto di base

Web app per trovare dove lavorare bene in città — non una lista statica di caffè, ma uno strumento **focalizzato solo sui locali dove si può lavorare da remoto**, con un layer di dati generati dalla community per restare sempre aggiornato. **Si lancia a Barcellona**, ma il prodotto è pensato per più città (vedi "Scope geografico").

**Perché è diverso da una semplice lista/blog:** il problema che risolve è quotidiano ("dove vado a lavorare oggi"), non una scelta fatta una volta sola. Il valore sta nella freschezza del dato (verificato di recente, confermato da più persone), non solo nella curatela iniziale.

## Target utente (aggiornato 4 ott 2026)

**Lavoratori da remoto (remote worker)** — target primario, deciso. Comprende: dipendenti in smart working o full remote, freelance, expat che lavorano da remoto e **anche** i nomadi digitali, che sono una parte del target e non il target intero. Al lancio: quelli che vivono o passano da Barcellona.

**Terminologia (deciso 4 ott 2026):**
- **La parola "nomads" non compare mai nell'app** (interfaccia, badge, copy, brand). Il badge è **"Certified for remote work"**.
- Chi usa e contribuisce all'app si chiama **"users"** nei testi (es. "Confirmed by 12 users", "2 of 10 users to get certified").
- Nei documenti interni "nomadi digitali" resta solo per indicare quel segmento specifico o canali che portano quel nome (es. r/digitalnomad, Nomad List).

Barcellona è un mercato favorevole per il lancio: molte persone che lavorano da remoto (residenti in smart working, freelance, expat), una delle community di nomadi digitali più grandi d'Europa (oltre il 30% dei permessi di residenza per nomadi digitali in Spagna rilasciati nell'area di Barcellona), ecosistema coworking molto denso (350+ spazi), città compatta e camminabile. Inoltre il fondatore ci vive (raccolta dati e certificazione sul campo).

## Concorrenza e differenziazione

Esistono già liste/prodotti simili (es. Cafelist, con una pagina dedicata a Barcellona, oltre a numerosi blog "best laptop-friendly cafes"). Concorrente diretto più vicino: Coffice (vedi `claude/concorrenza-coffice.md`); da analizzare remotework.cafe.

Differenzianti (decisi):
- **vs Google Maps:** il focus — solo locali adatti a lavorare, con attributi che Google non ha (politica laptop, prese, adatto a stare a lungo) e una mappa senza rumore
- **vs blog/liste statiche:** contributi della community + app interattiva, dati aggiornati e confermati

**Lo stato live NON è il differenziante al lancio** — rimandato a quando ci sarà una base utenti ampia (vedi "Funzionalità future").

## Piattaforma (aggiornato 28 set 2026)

**Strategia in due fasi:** web per acquisire utenti e raccogliere il primo contributo, app negli store per l'uso ricorrente.

### Fase 1 — Web app responsive, mobile-first (lancio)
Usabile da desktop e mobile senza download.

Motivazioni: nessuno scoglio del download al primo contatto; link condivisibili (diffusione nei gruppi WhatsApp/Facebook di chi lavora da remoto, community expat e nomadi); ogni scheda locale è una pagina indicizzabile da Google (stesso canale di traffico dei blog); aggiornamenti immediati.

Mobile-first perché il momento d'uso tipico è per strada, telefono in mano. Desktop secondario ma utile (pianificare la giornata dal laptop).

**Installazione PWA ("Aggiungi a Home"): solo un extra, non la strategia.** Pochissimi utenti la usano, su iOS è nascosta nel menu di condivisione. Non va considerata come "l'app".

### Fase 2 — App nativa iOS/Android (deciso)
- **Timing:** il lavoro sull'app parte **appena il sito è live**; pubblicazione negli store **20-30 giorni dopo il lancio web**. Non in contemporanea, per non rallentare il lancio del sito.
- **Ruolo:** fidelizzazione, non acquisizione. Chi scarica l'app è già coinvolto: l'app serve a farlo tornare e contribuire più spesso. I nuovi utenti continuano ad arrivare dal web.
- **Stesso codice, impacchettato** (es. Capacitor), non un secondo progetto.
- **Funzioni native che giustificano l'app** (e la rendono accettabile per Apple, che rifiuta i siti semplicemente impacchettati — linee guida App Store 4.2): notifiche di prossimità con app chiusa ("Sei da Café X? Fai check-in"), check-in più rapido con posizione, eventualmente notifiche push. Da definire quali entrano nella prima versione.
- **Promozione dal web:** banner "Get the app" mostrato agli utenti già coinvolti (es. dopo il secondo contributo), non al primo accesso.
- **Metrica da seguire:** utenti che tornano più volte a settimana (pubblico naturale per l'app).

### Costruire da subito pensando all'app (requisiti per lo sviluppo web)
- Stack compatibile con l'impacchettamento via Capacitor (o equivalente) senza riscrittura
- Dati dietro un'**API separata dal frontend**, riusabile dall'app
- Login (Google / magic link) che funzioni anche dentro l'app nativa (redirect e deep link)
- URL delle schede (`/{city}/{locale}`) pensati per diventare **deep link / universal link** nell'app
- Evitare dipendenze solo-browser non replicabili in app; geolocalizzazione, fotocamera e upload foto implementati in modo sostituibile con le API native
- Stati offline e di caricamento curati (servono sia al web sia all'app)

## Scope MVP

Domanda che l'MVP deve validare: *chi lavora da remoto usa l'app per scegliere dove lavorare, e alcuni utenti contribuiscono con dati?*

**Incluso:**
- Mappa con mappa di base minimale (senza POI) + **vista lista** con geolocalizzazione dell'utente, ordinabile **per distanza (default) o per score** ("Top rated")
- Filtro **"Certified for remote work"** (unico filtro al lancio)
- **Score "Would you work here again?"** (sì/no) mostrato in % in lista e nella scheda
- **Certificazione a due strade** (manuale + automatica dalla community), con barra di avanzamento sui locali "community"
- **Scheda locale:** dati base, score, attributi di lavorabilità con data e conferme, foto, pulsante per contribuire
- **Form di contributo** attivo dal giorno 1 (voto sì/no, tag, foto, check-in)
- Segnalazione di locale mancante o chiuso
- **Account leggero** (accesso con Google o link magico via email, senza password)
- **Moderazione minima:** pulsante "segnala" su foto e dati + pannello admin per rimuovere contenuti e revocare certificazioni
- **Pagina "How certification works"** (testo pubblico in `claude/certificazione.md`)
- Lingua: **inglese**
- Base legale: privacy policy (GDPR), termini d'uso con licenza sulle foto caricate, attribuzione OSM visibile sulla mappa
- **Metriche definite prima del lancio** (es. utenti attivi settimanali, utenti che tornano, numero di contributi e di contributori distinti)
- Riconoscimento contributori a costo zero: nome del contributore sulla scheda locale, titolo di "fondatore" ai primi collaboratori

**Escluso dall'MVP web:** stato live, loyalty program strutturato, locali promossi, filtro wifi, filtro "aperto ora", banner/notifiche di prossimità, recensioni testuali classiche, rating a stelle, lingue aggiuntive. L'app nativa non è nel lancio web ma è pianificata subito dopo (vedi "Piattaforma", Fase 2).

## Scope geografico

**Barcellona è la città di lancio, non l'identità del prodotto.** Obiettivo di lungo periodo: più città. Si parte da Barcellona perché il fondatore ci vive e perché il mercato si presta al lancio.

**Principio (deciso 28 set 2026):** nessuna decisione di brand o prodotto va presa solo sulla base di Barcellona — nome, colori, motivi grafici, copy restano neutri rispetto alla città. Nome della città e quartieri sono **dati**, non design.

Implicazioni pratiche:
- **Città nell'URL fin dal giorno 1** (`/barcelona/{locale}`), così aggiungere altre città non rompe i link già condivisi
- Schema dati con la città come campo (non implicita)
- Testi dell'interfaccia con il nome città come variabile (es. "the first 50 people mapping cafés in {city}")
- Stato live, zone, soglie: definiti per città
- Utente in una città non coperta: schermata "Not in {city} yet" con voto per la città (misura la domanda per l'espansione)
- La certificazione automatica funziona in ogni città senza lavoro del fondatore: è il motore principale dell'espansione

Al lancio: **tutta Barcellona fin da subito** (copertura base da OSM su tutta la città). La tensione "dato live senza densità di utenti" è risolta rimandando lo stato live.

## Mappa e filtri

- **Due strati:** mappa di base da fornitore di tile basato su OSM (es. MapTiler, Stadia Maps — i server ufficiali OSM non sono adatti all'uso intensivo) con stile minimale che nasconde tutti i POI; sopra, solo i locali del database dell'app. La mappa di base copre già tutto il mondo.
- **Import da OSM:** `amenity=cafe` + `amenity=bar`. Esclusi pub e ristoranti. Scelta consapevole: non si escludono a priori i bar non adatti, il rumore si gestisce con il filtro certificato. **Proposta (da confermare):** import città per città con script parametrizzato e aggiornamento periodico.
- **Tre livelli di informazione, visibili sulla mappa:** *Not checked yet* (solo OSM, puntino grigio) → *Community info* (≥1 contributo, pin bianco bordato) → *Certified* (pin espresso con spunta crema)
- **Filtro "Certified for remote work":** spento di default all'inizio (pochi certificati); acceso di default quando i certificati saranno qualche decina
- **Filtro wifi:** rimandato. Il dato wifi resta tra gli attributi. In futuro: il dato della community prevale sul tag OSM `internet_access` (valori `wlan`, `yes`, `no`, `internet_access:fee`), che vale solo come indicazione "da confermare"
- **Filtro "aperto ora":** escluso dall'MVP (orari OSM non sempre affidabili)

## Score "Would you work here again?" (deciso 28 set 2026)

- Ogni contributo include un voto **sì/no**; lo score è la **percentuale di sì** ("94% would work here again · 17 votes")
- Scelto al posto delle stelle 1-5: più stabile con pochi voti, un tocco, niente ambiguità su cosa vale un "3". Stelle rivalutabili in futuro
- **Sotto i 5 voti** si mostra "2 of 2" invece della percentuale
- **Ordinamento "Top rated":** non per % pura (un 1 su 1 non deve superare 45 su 48) ma per un punteggio che tiene conto del numero di voti (es. limite inferiore dell'intervallo di Wilson); locali sotto i 5 voti in fondo, locali senza info per ultimi
- Lo score è uno degli ingressi della certificazione automatica (vedi sotto)

## Certificazione "Certified for remote work" (v2, deciso 28 set 2026 — dettagli in `claude/certificazione.md`)

- **Scopo: togliere il rumore, non premiare la qualità.** Esclude bar senza tavoli, locali solo colazione/brunch ad alto ricambio, locali solo serali. Un bar con tavoli dove nessuno ti manda via se lavori al computer è dentro. Le differenze di qualità le dicono score e scheda.
- **4 criteri:** (1) tavoli a sedere adatti al laptop; (2) si può lavorare col laptop senza essere invitati ad andarsene, con eventuali limiti chiari e riportati in scheda; (3) Wi‑Fi per i clienti che regge un lavoro normale; (4) aperto di giorno nei feriali. Prese e rumore solo in scheda.
- **Un badge, due strade:**
  - **Manuale** — visita del fondatore (poi "ambassador" locali): per i 5-8 locali del lancio e i casi particolari. In scheda: "Visited by our team"
  - **Automatica** — si attiva da sola con: ≥10 utenti diversi, almeno metà con check-in verificato, contributi distribuiti su ≥14 giorni, score ≥75%, maggioranza che conferma Wi‑Fi presente e "Long stays: Welcome", aperto di giorno, nessuna segnalazione aperta. In scheda: "Confirmed by 12 users"
- **Controllo del fondatore:** lista "Nuovi certificati automatici" nel pannello admin con revoca in un tocco + controlli a campione
- **Mantenimento:** revoca automatica se lo score scende sotto il 60% (≥10 voti) o i contributi recenti smentiscono Wi‑Fi/long stays; coda di revisione con ≥2 segnalazioni dello stesso problema in 30 giorni o cambio di gestione; i certificati manuali dopo 12 mesi restano se la community continua a confermarli
- **Anti-manipolazione:** un voto per utente per locale ogni 30 giorni, solo account verificati, pattern sospetti → revisione invece di certificazione
- **Mai acquistabile**, separata dai futuri locali "promossi"

## Strategia dati

### Fonte base: OpenStreetMap
**OpenStreetMap** (licenza ODbL) come fonte per nome, posizione, categoria dei locali — scaricabile e salvabile liberamente, con attribuzione a OSM. Disponibile per qualsiasi città → nessun ostacolo all'espansione.

**Perché non Google Maps/Places:** i termini di Google Maps Platform vietano di salvare/mettere in cache i dati fuori dalle chiamate live all'API (unica eccezione: coordinate per 30 giorni). Non è possibile costruire un database permanente con dati scrapati o presi via API da Google (recensioni incluse). Google Places può essere usato solo in modalità *live*, se necessario in futuro per funzioni accessorie.

**Nota ODbL:** le correzioni/integrazioni ai dati OSM vanno condivise; strada più semplice = riportare le correzioni direttamente su OSM. Da verificare le linee guida della OSM Foundation sui "collective database" prima dello schema definitivo.

### Livelli di dati
1. **Base (da OSM, mai raccolti a mano):** ID OSM, nome, coordinate, indirizzo, città, quartiere, orari, telefono, sito, Instagram. Telefono e social secondari (mostrati se presenti). Orari importanti → segnalabili dagli utenti come errati.
2. **Attributi di lavorabilità (il moat del progetto):**
   - Obbligatori: wifi (nessuno/lento/veloce), prese (**nessuna/poche/tante**), rumore (rumoroso/silenzioso), adatto a stare a lungo (sì/no)
   - Primo opzionale, alto valore: **politica laptop** (fasce orarie vietate es. pranzo/weekend, limiti di tempo)
   - Altri opzionali: aria condizionata, tipo di tavoli/sedie, bagno disponibile, consumazione minima
3. **Contenuti community:** **voto "would work here again" (sì/no)**, foto, tag strutturati, nota breve opzionale, check-in (geolocalizzato → contributo "verificato"). **Niente recensioni testuali classiche all'inizio** (poco utili per il caso d'uso, sezioni vuote con pochi utenti, moderazione onerosa).

**Livello del locale (derivato):** `osm_only` (nessun contributo) → `community` (≥1 contributo) → `certified`, con **origine** (`manual` / `community`), data di certificazione ed eventuale data di revoca.

**Principio trasversale:** ogni dato dei livelli 2 e 3 ha **autore, data e numero di conferme** (es. "wifi buono, confermato da 4 persone, ultima volta 3 giorni fa"). Rende visibile la freschezza, alimenta la certificazione automatica e predispone lo schema al futuro stato live.

**Foto:** mai prese da Google; nei termini d'uso l'utente concede la licenza d'uso; evitare volti riconoscibili di terzi (GDPR).

## Design / UX (sintesi — dettagli in `claude/design-ux.md`)

- **Struttura e flussi approvati** (28 set 2026): mappa come home senza tab bar, lista come bottom sheet (ordinabile per distanza o score), scheda locale con URL propria, contributo come "conferma" precompilata, login solo all'invio
- **Direzione visiva:** premium e sobria (riferimento Uber) con toni del caffè; tema principale **chiaro ("Latte")** scelto per pulizia, professionalità, accessibilità e inclusività; colore "crema" riservato ai locali certificati
- **Locali senza feedback** (quasi tutti al lancio): puntino grigio, "No work info yet" in lista, anteprima "Be the first to check it"; home del lancio con messaggio onesto "We're just getting started here"
- **Locali community:** barra "2 of 10 users to get certified" che invita al check-in
- **Copy:** mai "nomads"; utenti = "users"
- Canvas con wireframe e mockup: https://claude.ai/artifact/4n41M3RRRxzp9Xkpxbt7Pj

## Strategia cold start (raccolta dati iniziale)

Vincolo dichiarato: il progetto parte come **side project**, tempo disponibile solo dopo il lavoro — la raccolta dati manuale deve essere minima e time-boxed.

Piano:
- **5-8 locali iniziali** (non 20-50), raccolti in 2-3 uscite informali, anche nei posti già frequentati normalmente — sono i primi certificati manuali e servono a **validare sul campo i criteri**
- **Checklist rapida per locale** (~5 minuti, vedi `claude/certificazione.md`): 4 criteri sì/no, attributi, politica laptop, 2 foto
- **Nessun permesso formale richiesto** per i dati base — sono informazioni pubbliche; per le foto, comportarsi da cliente normale
- **Form di contributo utenti attivo fin dal giorno 1**: da lì in poi la certificazione cresce da sola con la community
- **Coinvolgere 2-3 persone che lavorano da remoto a Barcellona** (colleghi in smart working, freelance, community expat e nomadi) per distribuire il carico di raccolta iniziale, in cambio di riconoscimento (titolo di "fondatore", early access)
- Con pochi certificati la mappa non appare vuota grazie ai locali OSM in secondo piano

Razionale: il dato raccolto a mano (non scrapabile) è il vero *moat* del prodotto — copiarlo richiede a un concorrente di rifare lo stesso lavoro sul campo.

## Funzionalità future (post-MVP)

- **App nativa iOS/Android** — pianificata, pubblicazione 20-30 giorni dopo il lancio web (vedi "Piattaforma", Fase 2)
- **Nuove città** (dopo aver validato l'MVP a Barcellona; priorità guidata dai voti "Not in {city} yet")
- **Ambassador locali** che certificano di persona nelle nuove città
- **Stato live** (posti liberi, wifi funzionante ora, rumore ora): segnalazioni con scadenza breve (1-2 ore). Attivazione **zona per zona** al superamento di una soglia oggettiva (es. numero minimo di check-in al giorno nella zona — da definire). Le zone saranno determinate dai dati d'uso reali (ipotesi iniziale a Barcellona: Poblenou, Gràcia, Eixample). Motivo del rinvio: con pochi utenti evidenzierebbe la scarsa attività.
- **Banner di prossimità** dentro la web app ("Sei da Café X? Fai check-in") — fattibile con app aperta; con app chiusa solo nell'app nativa
- **Loyalty program:** meccaniche da progettare osservando il comportamento dei primi utenti; i check-in sono la base naturale per i punti.
- **Locali promossi:** spazio a pagamento, sempre etichettato chiaramente (fiducia utenti + norme UE sulla riconoscibilità della pubblicità), separato dalla certificazione. Un locale promosso non diventa certificato; un certificato non ottiene visibilità extra pagando.
- **Filtri wifi e "aperto ora"**
- **Lingue aggiuntive**

## Monetizzazione (idee, non priorità attuale)

Modelli plausibili per il futuro:
- Affiliazione con spazi coworking (upsell per chi cerca più silenzio/prese)
- Partnership con i locali: spazio **"promosso"** a pagamento (distinto dalla certificazione, vedi sopra)
- Sponsorizzazioni mirate (brand caffè, laptop, cuffie noise-cancelling)
- Freemium/membership (richiede massa critica di utenti)
- Dati aggregati (insight su pattern di lavoro remoto)

Riferimento di modello maturo: TheFork — partnership dirette con i locali, recensioni verificate tramite transazioni reali. Richiede anni e un team commerciale — non replicabile al lancio, ma è la direzione a cui tendere se il prodotto prende trazione.

## Workflow di sviluppo

- **Claude Code** per lo sviluppo effettivo (codebase persistente su file, non singole chat)
- **Git** per checkpoint, un commit per feature
- **File `CLAUDE.md`** nella root del progetto con contesto tecnico persistente (stack, convenzioni, decisioni prese) — letto automaticamente da Claude Code a ogni sessione. Deve includere i requisiti "costruire pensando all'app" (vedi "Piattaforma") e la regola di copy "mai 'nomads', utenti = 'users'"
- **Plan mode** prima di implementare feature complesse
- Separazione netta tra "sto decidendo" (chat/brainstorming, anche su Claude.ai) e "ho deciso, implemento" (Claude Code) — per contenere il consumo di token

### Modelli Claude per task
- **Sonnet 5** — default per la maggior parte del lavoro di sviluppo (feature, componenti, fix)
- **Opus 5** — decisioni architetturali difficili, refactor ampi, bug complessi, planning di feature complesse
- **Haiku 4.5** — task meccanici/ripetitivi (copy, formattazione, piccole modifiche)
- Fable 5.1 non necessario per la scala di questo progetto

### Organizzazione del Progetto su Claude.ai
- Un progetto dedicato con più file di knowledge base separati per argomento (es. `decisioni-prodotto.md`, `marketing.md`, `costi-monetizzazione.md`) invece di un unico documento
- Ogni conversazione tematica (homepage/UX, feature roadmap, marketing, costi) riporta le proprie conclusioni sintetiche nella knowledge base a fine discussione

## Decisioni ancora aperte

- [ ] Nome del progetto/app (serve prima di condividere il link e prima di pubblicare negli store) — **non legato a Barcellona**, niente "nomad" (vedi `claude/naming.md`)
- [ ] Stack tecnico (framework per la web app, hosting, database, fornitore tile mappe) — **vincolo: impacchettabile come app nativa senza riscrittura (es. Capacitor)**
- [ ] App nativa: quali funzioni native nella prima versione (notifiche di prossimità, push, check-in) + account sviluppatore Apple/Google
- [ ] Validare dopo il lancio le soglie della certificazione automatica (10 utenti, metà check-in, 14 giorni, 75%), se il Wi‑Fi resta obbligatorio, se serve una domanda sui tavoli
- [ ] Strategia di import OSM (proposta: città per città)
- [ ] Metriche MVP e soglie di successo
- [ ] Chi coinvolgere per la raccolta iniziale (nomi/contatti reali di persone che lavorano da remoto a Barcellona)
- [ ] *Futuro:* soglia di voti per aprire una nuova città
- [ ] *Futuro:* soglia di attivazione dello stato live per zona
- [ ] *Futuro:* meccaniche del loyalty program

### Decisioni chiuse
- [x] Schema dati del layer arricchito (campi obbligatori/opzionali)
- [x] Piattaforma: web app mobile-first al lancio
- [x] *(28 set)* App nativa iOS/Android: lavoro avviato appena il sito è live, pubblicazione negli store 20-30 giorni dopo; stesso codice impacchettato; ruolo = fidelizzazione. Il web si costruisce fin da subito pensando all'app
- [x] Scope MVP (incluso/escluso)
- [x] Zone pilota: non più da decidere a tavolino, determinate dai dati d'uso quando si attiverà il live
- [x] *(28 set)* Barcellona = città di lancio, non identità: brand e prodotto neutri rispetto alla città, città nell'URL
- [x] *(28 set)* Struttura UX e flussi approvati
- [x] *(28 set)* Direzione visiva premium + caffè, tema chiaro "Latte"
- [x] *(28 set)* Score "would work here again" in % (non stelle), visibile in lista, ordinamento per distanza o score
- [x] *(28 set)* Prese con tre valori: nessuna / poche / tante
- [x] *(28 set)* Tre livelli di informazione per locale (OSM → community → certificato)
- [x] *(28 set)* Certificazione v2: scopo = togliere il rumore; 4 criteri leggeri; un badge con due strade (manuale del fondatore + automatica dalla community con soglie anti-manipolazione); revoca automatica
- [x] *(4 ott)* Design MVP completo, inclusa la pagina "How certification works"
- [x] *(4 ott)* **Target = lavoratori da remoto** (i nomadi digitali sono un sottoinsieme); **mai "nomads" nell'app**; badge "Certified for remote work"; utenti = "users"
