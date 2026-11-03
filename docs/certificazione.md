# Criteri di certificazione — "Certified for remote work"

*Stato: v3.1 (30 ottobre 2026) — fonte unica dei criteri. Sostituisce la v2 del 28 settembre: due origini dello stesso badge ("Picked by our team" al posto di "Visited by our team"), criterio del Wi‑Fi uguale per le due origini, un solo voto attivo per utente e locale, revoca e controllo dei Picked dopo 12 mesi. Soglie da validare sul campo. Implementazione: `supabase/migrations/20261031120000_certification.sql`, comando `npm run certify`.*

---

## Principio

La certificazione **non è un premio di qualità**: serve a **togliere il rumore** dalla mappa. Deve escludere i posti dove non si lavora:
- bar senza tavoli (solo bancone o in piedi);
- locali solo colazione o brunch, dove il tavolo deve girare;
- locali che aprono solo la sera.

Un bar con diversi tavoli, dove nessuno ti manda via se tiri fuori il computer e lavori, **è dentro**. Le differenze di qualità (prese, rumore, velocità del Wi‑Fi) le raccontano lo score e la scheda, non il badge.

## Criteri (4, tutti necessari, per entrambe le origini)

| # | Criterio | Cosa esclude |
|---|----------|--------------|
| 1 | **Tavoli a sedere** dove appoggiare un laptop (non solo bancone, in piedi o tavolini minimi) | Bar da bancone |
| 2 | **Si può lavorare col laptop senza essere invitati ad andarsene**, almeno in alcune fasce. Eventuali limiti (es. no laptop a pranzo) devono essere chiari e vanno in scheda | Locali colazione/brunch ad alto ricambio, locali che vietano i laptop |
| 3 | **Wi‑Fi per i clienti presente** (Slow o Fast). La qualità va in scheda; nessuno speed test | Locali senza Wi‑Fi |
| 4 | **Aperto di giorno nei feriali** | Locali solo serali |

**Registrato ma non obbligatorio** (va in scheda): prese (None/A few/Plenty), rumore, qualità del Wi‑Fi, aria condizionata, bagno, consumazione minima.

## Un badge, due origini

Stesso pin, stesso badge "Certified for remote work". Cambia solo la riga sotto il badge nella scheda.

### Picked — "Picked by our team · Oct 2026"
Selezione del team da **fonti pubbliche e controllo da scrivania** (regole sui laptop, orari, foto), anche senza visita. Al lancio: 30-40 locali scelti dal fondatore.
- Si sceglie da Terminale: `npm run certify -- --pick <city>/<slug> --note "<fonti consultate>"` (la nota è obbligatoria e resta privata). Funziona anche su un locale senza contributi.
- La riga mostra **mese e anno della scelta**, nella lingua della pagina.
- Il comando **rifiuta** il pick se il locale rientra già in una condizione di revoca (qui sotto) e dice quale: lo perderebbe al primo ricalcolo.
- Un Picked che soddisfa le condizioni della certificazione automatica **diventa Confirmed da solo**.

#### Informazioni del team (feature 8b)
Quando sceglie un locale, il team può salvare ciò che ha verificato da fonti pubbliche: Wi‑Fi (Fast / Slow / **Available**, solo del team: c'è ma non si sa quanto è veloce), prese, rumore, soste lunghe, regole sui laptop (pranzo, weekend), extras e una nota in inglese (≤ 140 caratteri). Ogni campo può mancare (= non noto).
- Si vedono solo mentre il locale è certificato, con "From our team · Oct 2026" al posto di conferme e freschezza; la nota sta tra le note, in ordine di mese, con la stessa etichetta. Dopo un `--unpick` o una revoca restano salvate ma non si mostrano.
- **Precedenza per attributo:** appena un contributo attivo risponde, vale la community. I 4 attributi principali sono obbligatori nel form, quindi passano tutti alla community al primo contributo; le regole sui laptop quando qualcuno risponde alla domanda; gli extras chip per chip.
- **Non sono contributi:** non entrano in score, soglie, revoca, "Shared by", Founding contributor né conteggi di utenti.
- Il form "Still right?" le usa per precompilare (non il Wi‑Fi "Available"); "Everything's still right" crea un normale contributo dell'utente.

### Confirmed — "Confirmed by 12 users"
Il badge si attiva da solo quando un locale soddisfa **tutte** queste condizioni:

| Condizione | Soglia | Perché |
|---|---|---|
| Utenti diversi con un contributo attivo | **≥ 10** | Abbastanza voci da non dipendere da una sola opinione |
| Di cui con almeno un check-in verificato sul locale (entro 100 m; contano anche i check-in dei loro contributi superati) | **≥ metà** (la metà esatta basta) | Chi vota è stato davvero lì |
| Tempo tra il primo e l'ultimo contributo attivo di questi utenti | **≥ 14 giorni** | Filtro contro "gli amici del gestore" che votano tutti lo stesso giorno |
| Score "would work here again" | **≥ 75%** | La maggioranza ci tornerebbe a lavorare |
| Wi‑Fi "Slow" o "Fast" | **più della metà** di chi ha risposto | Criterio 3 |
| "Long stays: Welcome" | **più della metà** di chi ha risposto | Criterio 2 (esclude i posti da colazione/brunch) |
| Aperto di giorno nei feriali | vedi sotto | Criterio 4 |
| Segnalazioni aperte | **nessuna** (tranne quelle su foto o note, `inappropriate_content`) | Evita di certificare mentre c'è un problema noto |
| Nessuna condizione di revoca vera | — | Evita un badge che si accende e si spegne a ogni ricalcolo |

- **Chi conta**: solo i contributi attivi di account con email confermata, più quelli rimasti anonimi dopo la cancellazione di un account (per inviarli l'email doveva essere confermata). La stessa regola vale per lo score, gli attributi e il numero di utenti in tutta l'app.
- **Un solo voto attivo per utente e locale**: il nuovo sostituisce il precedente, che resta nello storico come superato. Tutti i voti pesano uguale.
- **Le foto non entrano mai nel calcolo.**
- **Orari**: se gli orari OSM si leggono con certezza e il locale non è mai aperto **almeno 4 ore tra le 8 e le 18 in almeno 3 giorni feriali**, la condizione blocca. Se gli orari mancano o non si leggono con certezza, non blocca.
- Il criterio 1 (tavoli) non ha una domanda dedicata: è implicito in "would work here again" e "long stays welcome". Se nella pratica passano bar senza tavoli, si aggiunge una domanda sì/no al modulo di contributo.
- Nella scheda dei locali non certificati c'è una barra di avanzamento ("2 of 10 users to get certified · 8 to go") che invita a fare check-in.
- Il fondatore vede i nuovi certificati automatici con `npm run certify -- --recent <city>` (poi nel pannello admin, lista **"Nuovi certificati automatici"**) e fa controlli a campione quando capita.

Tutte le soglie stanno in `certification_settings` (riga di default, sostituibile per città).

## Revoca e mantenimento

### Revoca automatica (entrambe le origini)
Un certificato torna "community" (o "Not checked yet", se non ha contributi) se, sui contributi attivi degli ultimi **12 mesi**:
- lo score scende **sotto il 60%** con **almeno 10 voti**, oppure
- tra i contributi degli ultimi **90 giorni** (almeno 3), **più della metà** dice Wi‑Fi "None", oppure più della metà dice "Long stays: Not really" (le due regole si contano separatamente).

Data e motivo restano salvati. Dopo una revoca, il locale torna certificato solo come Confirmed (condizioni qui sopra) o con un nuovo `--pick`.

### Picked dopo 12 mesi
Un Picked da più di 12 mesi che non soddisfa le condizioni della certificazione automatica **non perde il badge da solo**: compare in `npm run certify -- --due <city>` per un nuovo controllo. Dopo il controllo: `--pick` di nuovo (rinnova la data) oppure `--unpick`. Così non serve ricontrollare ogni anno i posti che la community continua a confermare (diventano Confirmed).

### Rimozione da parte del team: `--unpick`
- `npm run certify -- --unpick <city>/<slug> --reason "<motivo>"` toglie il badge a un Picked o a un Confirmed (il motivo è obbligatorio e resta privato).
- Su un **Confirmed** blocca anche la certificazione automatica di quel locale (altrimenti tornerebbe da solo al ricalcolo). Su un **Picked** basta togliere il badge; con `--block` si blocca anche l'automatica (es. il gestore chiede di uscire).
- Il blocco si toglie con `npm run certify -- --unblock <city>/<slug> --reason "<motivo>"` oppure con un nuovo `--pick`. Su un locale bloccato la scheda non mostra la barra "N of 10 users" (sarebbe un traguardo irraggiungibile); i contributi restano possibili come sempre.
- `--no-notice`: il locale perde il badge senza la riga "Certification removed" (pick fatto per errore, gestore che chiede di uscire). Il motivo resta comunque salvato.

### "Certification removed in Oct 2026"
Dopo una revoca automatica o un `--unpick`, la scheda mostra per **90 giorni** "Certification removed in {mese}" al posto della riga del livello, anche se il locale è tornato "Not checked yet". Lista e anteprima restano come sempre. La riga sparisce subito se il locale torna certificato.

### Quando si ricalcola
Subito dopo ogni contributo (nella stessa transazione) e ogni giorno alle 03:23 (job pg_cron) per le condizioni che dipendono dal tempo (14 giorni, 12 mesi, 90 giorni). Ogni cambio di livello, ogni pick, rimozione, blocco e sblocco resta nella tabella delle transizioni (locale, da, a, origine, motivo, quando, chi: sistema, comando o admin), privata.

### Coda di revisione (feature 9)
Se arrivano **2 o più segnalazioni** dello stesso problema in 30 giorni (es. nuovo divieto di laptop), o se cambiano nome o gestione, il locale va in coda di revisione nel pannello admin.

## Anti-manipolazione (oltre alle soglie)

- Un solo voto attivo per utente e locale; il più recente sostituisce il precedente.
- Solo account con email confermata (Google o email); al massimo 20 contributi al giorno per account.
- Pattern sospetti (molti voti nuovi in poche ore, account creati da poco che votano un solo locale) → il locale va in coda di revisione invece di certificarsi (dopo il lancio).

## Privacy

Le viste pubbliche espongono solo livello, origine, mese della certificazione o della rimozione, numero di utenti e, sui certificati, i valori e il mese delle informazioni del team. Mai la nota del pick, il motivo, chi ha scelto, le date esatte o gli identificativi.

## Indipendenza

- La certificazione **non si compra** e non si ottiene in cambio di favori. Chi certifica paga la propria consumazione e non certifica locali con cui ha legami.
- È **separata dai futuri locali "promossi"**: un locale promosso non diventa certificato, un certificato non ottiene visibilità extra pagando.

## Altre città

La certificazione automatica funziona ovunque senza lavoro del fondatore: è il motore principale dell'espansione. I Picked in una nuova città passano ad "ambassador" locali con gli stessi criteri; le loro prime 3-5 scelte vengono riviste dal fondatore.

Il filtro "Certified for remote work" parte acceso solo nelle città dove è impostato (`cities.certified_filter_default`, oggi Barcellona): in una città con pochi certificati si lascia spento.

## Da validare dopo il lancio

- Le soglie (10 utenti, metà con check-in, 14 giorni, 75%) producono certificati in tempi ragionevoli senza far entrare rumore?
- Il Wi‑Fi deve restare obbligatorio (molti lavorano in hotspot)?
- Serve una domanda esplicita sui tavoli nel modulo di contributo?

---

## Testo pubblico per la pagina "How certification works" (in inglese, come nel mockup 3e; la pagina /about arriva con la feature 10)

**Certified for remote work**
A certified place is somewhere you can sit down with your laptop and work without anyone asking you to leave. It's not a ranking: it filters out the places where you can't really work, like standing-only bars or busy brunch spots. To compare certified places, look at the score and the details on each page.

**What a certified place has**
- Tables you can work at
- Laptops welcome, with any limits made clear (e.g. "no laptops 13:00–15:30", shown on the page)
- Wi-Fi for customers
- Open during the day on weekdays

**Two ways to get certified**
- **Picked by our team:** we checked the place's laptop rules, opening hours and photos before adding it
- **Confirmed by users:** the badge turns on by itself when the community agrees: 10+ people have been there, half of them checked in on site, at least 2 weeks between the first and last visit, 75%+ would work there again

**Three kinds of places on the map**
- **Certified:** picked by us or confirmed by the community
- **Community info:** a few people shared what it's like. Check in to help it get certified
- **Not checked yet:** we only know it exists. Been there? Tell others

**Always independent**
Certification can't be bought. Places can't pay for the badge or for a better position. If a place stops meeting these criteria, it loses the badge. Something changed at a certified place? Report it from the place's page. We review every report.
