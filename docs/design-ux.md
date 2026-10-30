# Design / UX — [App name]

*Stato: DESIGN MVP COMPLETO — struttura approvata, tema "Latte" su tutte le schermate, score, livelli e certificazione a due strade disegnati. Ultimo aggiornamento: 4 ottobre 2026 (terminologia: niente "nomads", utenti = "users").*
*Canvas: https://claude.ai/artifact/4n41M3RRRxzp9Xkpxbt7Pj — pagine "Struttura e flussi" (wireframe), "Direzione visiva" (confronto Latte/Espresso + palette), "App · tema Latte" (mockup definitivi, si parte da 1a in Play; 1b ha l'ordinamento interattivo; 3e = How certification works; riga 5 = locali senza feedback e livelli).*

## Principi guida
- **Barcellona è la città di lancio, non l'identità del prodotto.** Nessuna scelta di design (colori, motivi, nome, copy) si basa sulla città. Nome della città e quartieri sono dati: nei testi sono variabili (`{city}`), negli URL un livello (`/barcelona/...`).
- **Target = lavoratori da remoto (remote worker)**, di cui i nomadi digitali sono solo una parte. **La parola "nomads" non compare mai nell'interfaccia** né nel brand. Chi usa e contribuisce all'app si chiama **"users"** nei testi.

## Decisioni prese
- [x] **Struttura e flussi approvati**
- [x] **Lista come bottom sheet** sopra la mappa
- [x] **Filtro "Open now" fuori dall'MVP**. Unico filtro al lancio: **"Certified for remote work"**
- [x] **Banner di prossimità** → next step post-MVP
- [x] **Direzione visiva "premium + caffè"**, tema principale **Latte (chiaro)**; Espresso (scuro) candidato per una futura modalità scura
- [x] **Crema solo per i certificati**, pulsanti in espresso
- [x] **Città nell'URL** fin dal giorno 1
- [x] **Outlets: None / A few / Plenty**
- [x] **Score "Would you work here again?"** sì/no → % ("94% would work here again"), al posto delle stelle (per ora). Visibile in ogni riga della lista. Sotto i 5 voti: "2 of 2"
- [x] **Ordinamento lista: Nearest (default) / Top rated**
- [x] **Tre livelli di informazione** (Not checked yet → Community info → Certified)
- [x] **In lista i locali senza info mostrano solo "No work info yet"** (niente "Add it"; l'invito resta nell'anteprima e nella scheda)
- [x] **Certificazione a due strade** (manuale / automatica dalla community) — criteri in `claude/certificazione.md`
- [x] **Offline e caricamento:** nessun mockup dedicato, si gestiscono in sviluppo con gli stili esistenti (righe "fantasma" durante il caricamento, messaggio "You're offline")
- [x] *(4 ott)* **Badge rinominato "Certified for remote work"** (era "Certified for nomads"); **utenti = "users"** in tutti i testi

## Score e ordinamento
- Score = % di "sì" alla domanda "Would you work here again?", chiesta come prima cosa nel form di contributo.
- In lista: pollice + percentuale allineati a destra del nome; sotto i 5 voti "2 of 2" in piccolo; locali senza info senza score.
- **Top rated** non ordina per % pura: si usa un punteggio che tiene conto del numero di voti (es. limite inferiore dell'intervallo di Wilson), così 1 su 1 non supera 45 su 48. Sezioni: prima i locali con ≥5 voti, poi "Not enough votes yet", poi quelli senza info.
- Lo score è uno degli ingressi della certificazione automatica (≥75% con ≥10 utenti).

## Tre livelli di informazione
1. **Not checked yet** — solo dati OSM. Puntino grigio piccolo; in lista testo attenuato + "No work info yet"; tap → anteprima "Be the first to check it" con CTA "I'm here · add work info". Tag Wi‑Fi OSM come "unconfirmed".
2. **Community info** — ≥1 contributo, non certificato. Pin bianco con bordo espresso e punto centrale (niente crema). Scheda: "COMMUNITY INFO · NOT CERTIFIED YET", attributi noti con conferme, mancanti come riquadro tratteggiato "Not known · Add it", **barra di avanzamento "2 of 10 users to get certified · 8 to go"** che invita al check-in.
3. **Certified for remote work** — scelto dal team (Picked) o confermato dalla community. Pin espresso pieno con spunta crema, sigillo, foto. Unico livello che usa il crema. In scheda, sotto l'etichetta "CERTIFIED FOR REMOTE WORK", l'origine: "Picked by our team · Sep 2026" oppure "Confirmed by 12 users". Dopo una rimozione, per 90 giorni, al posto della riga del livello: "Certification removed in Oct 2026". Il sigillo porta alla pagina "How certification works".
- **Home al lancio:** mappa piena di puntini grigi; messaggio "We're just getting started here · 1 certified and 2 checked nearby. 20 more cafés are waiting for someone to try them".

## Pagina "How certification works" (/about)
Si apre toccando il sigillo nella scheda. Contenuto: titolo "Certified for remote work" · cosa significa il badge (filtra il rumore, non è una classifica) · i 4 criteri con icone · le due origini (card "Picked by our team" e "Confirmed by users" con le soglie 10+ / ½ check-in / 2 settimane / 75%+) · i tre tipi di pin · riquadro "Always independent" · invito a segnalare cambiamenti + "Find a place to work". Testo sorgente in `docs/certificazione.md`.

## Direzione visiva: tema Latte
- Riferimento: Uber — un solo font forte, pochi colori, pulsanti grandi e pieni, molto spazio; toni del caffè al posto del bianco/nero puro.
- **Palette:** Milk #FAF7F3 (sfondo) · Espresso #1F1712 (testo, pulsanti, pin) · Crema #C8894A (solo certificati) · Roast #6B5D53 (testo secondario) · Foam #F3ECE4 (pill, tile, pulsanti secondari) · Map #F2EDE6. Icone accento #9C6230. Distruttivo #9B2C1F.
- **Font:** Geist (titoli 800, tracking stretto) + Geist Mono per numeri e freschezza.
- **Componenti:** pulsante primario espresso 56 px raggio 16; secondario Foam; segmented control su Foam con opzione attiva bianca (usato anche per l'ordinamento); pin certificati espresso + spunta crema; pin community bianchi bordati; sigillo crema accanto al nome; score con icona pollice; barra di avanzamento crema.
- Il caffè sta nella palette, non nelle illustrazioni. Premium ma accessibile.
- Variante scura (futura): Espresso #15100D, Cup #221A15, Milk #F6EFE7, Crema #E0A866, Steam #B3A497.

## Struttura
- **Home = mappa**, nessuna tab bar. Profilo in alto a destra.
- **Lista = bottom sheet**, ordinabile Nearest / Top rated.
- **Tap su pin → anteprima** (foto, attributi, freschezza, See details / Directions).
- **Scheda locale** con URL propria: foto, sigillo con origine, nome, zona/distanza/orari, score con numero di voti, 4 attributi con conferme e data, politica laptop in evidenza, contributori. Barra fissa: "Check in here" + Directions.

## Stati aggiuntivi (disegnati)
- **Posizione disattivata:** selettore città + scelta area con numero di certificati per quartiere.
- **Città non coperta:** "Not in {city} yet" + voto per la città con barra verso una soglia + elenco città aperte.
- **Filtro Certified senza risultati:** "Show all places" o "Zoom out".
- **Profilo /me:** badge, statistiche, contributi recenti, account, elimina account (GDPR).

## Flusso contributo
1. "Would you work here again?" Sì/No
2. "Still right?" — form precompilato + "Everything's still right" (un tocco)
3. Attributi obbligatori: Wi‑Fi None/Slow/Fast · Outlets None/A few/Plenty · Noise Quiet/Noisy · Long stays Welcome/Not really
4. Opzionali: laptop rules, dettagli, foto, nota 140 caratteri
5. Login solo all'invio (Google o magic link) → ringraziamento con contatori + badge "Founding contributor"
- Check-in verificato se entro ~100 m (conta per la certificazione automatica).
- Segnala problema e Aggiungi locale come da mockup (passano dal pannello admin).

## Desktop e admin
- Desktop: barra in alto (nome app, selettore città, ricerca, filtro "Certified for remote work", Add a place, Sign in); lista a sinistra con ordinamento + mappa a destra.
- Admin (wireframe): code Reports / New places / Certification + lista "Nuovi certificati automatici" con revoca.

## Mappa delle pagine (URL)
`/` · `/{city}` · `/{city}/{locale}` · `/{city}/{locale}/update` · `/add` · `/about` · `/me` · `/privacy` · `/terms` · `/admin`. Post-MVP SEO: `/{city}/{quartiere}`.

## Note tecniche
- **Mappa di base** servita dal fornitore di tile, copre già il mondo. **Locali OSM:** proposta di import città per città con aggiornamento periodico.
- **Prossimità:** banner dentro l'app fattibile con app aperta (next step); notifiche con app chiusa solo con app native.

## Domande aperte
- [ ] Nome dell'app (neutro rispetto alla città)
- [ ] Confermare la strategia di import OSM città per città
- [ ] Soglia di voti per aprire una nuova città (nel mockup: 200, esempio)
- [ ] Aggiornare il wireframe admin con la coda "Nuovi certificati automatici" (quando si arriva allo sviluppo)
