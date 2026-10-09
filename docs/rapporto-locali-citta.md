# Rapporto con i locali e la città

*Stato: proposta (9 ottobre 2026), da discutere. Decisi finora: il messaggio di fondo e le lingue (EN/ES/CA al lancio).*

## Perché serve
Il rischio è che l'app venga percepita come "fatta per gli expat che occupano i tavoli", in una città dove il tema della gentrificazione e dei bar tradizionali che spariscono è sentito. È stata la prima reazione di una persona vicina al progetto: va presa come anteprima di quello che si troverà nei canali locali (r/Barcelona, gruppi di quartiere) al lancio.

Il copy da solo non basta: la percezione dipende da cosa l'app fa davvero nei locali.

## Messaggio di fondo (approvato)
> **Portiamo clienti nelle ore vuote ai locali che li vogliono, e lasciamo in pace quelli che non li vogliono.**

- Non basare la difesa del brand sul dibattito macro (expat vs stipendi, affitti): è contestato e non si vince in un thread.
- Restare sul concreto: rispetto delle regole dei locali, ospiti che consumano, scelta del gestore.

## Posizionamento dell'utente
- L'utente è **chiunque lavori da remoto**, compresi i residenti: il catalano in smart working da un monolocale a Sants è utente quanto il freelance straniero.
- Immagine: un mondo del lavoro che cambia, persone che cercano un posto accogliente e conveniente invece di un coworking caro. Non expat, non nomadi.
- Coerente con le decisioni del 4 ott (target = remote worker, mai "nomads").

## Lingue (deciso 9 ott)
- **App in inglese, spagnolo e catalano già al lancio**, con i18n dal primo commit. Un'app solo in inglese avrebbe confermato lo stereotipo dell'expat più di qualsiasi copy.
- Catalano rivisto da un madrelingua (revisore individuato dal fondatore).
- Si traducono interfaccia, pagine statiche ed email; non i contenuti degli utenti né i nomi dei locali.
- Dettagli nel contesto progetto, sezione "Lingue".

## Proposte da valutare

### 1. Codice del "buon ospite"
Poche regole visibili, parte del brand (si lega alla tagline *Work anywhere, welcome.*).
- Dove: pagina About, schermata di ringraziamento dopo il check-in, eventualmente in scheda accanto alla politica laptop.
- Bozza in fondo al documento (da tradurre anche in ES e CA).

### 2. Voce ai gestori
- Il gestore può **fissare i limiti** (es. "no laptops 13:00–16:00") e vederli in scheda.
- Il gestore può **chiedere di uscire** dalla certificazione o dall'app.
- MVP: link "Own this place?" in scheda → modulo che passa dalla coda admin, verifica manuale del fondatore. Niente account gestore dedicato per ora.
- Un divieto di laptop si mostra come informazione neutra e rispettosa, non come difetto del locale.
- La pagina per i gestori è nelle tre lingue: è il testo che i gestori locali leggeranno più probabilmente in spagnolo o catalano.

### 3. Bar ad alto ricambio nell'import OSM
- L'import include `amenity=bar`: un bar di quartiere con tavoli e Wi‑Fi può certificarsi da solo tramite la community, anche se vive di ricambio.
- Il criterio 2 e la maggioranza "Long stays: Welcome" coprono già parte del rischio.
- Proposta leggera: nella lista admin "Nuovi certificati automatici" evidenziare i locali `amenity=bar` per un controllo prioritario. Valutare dopo il lancio se serve di più.

### 4. Comunicazione di lancio nei canali locali
- Messaggio di lancio in spagnolo/catalano per i gruppi locali.
- Risposta pronta alla domanda "Non peggiora la gentrificazione?", basata sul messaggio di fondo e sulle misure sopra (buon ospite, scelta del gestore).
- Possibile contatto con 2-3 gestori prima del lancio per sentire la loro reazione (si lega al test a voce con "1-2 gestori di caffè" in `claude/naming.md`).

## Bozze di testo pubblico (inglese, lingua sorgente)

**Be a good guest**
- Order something, and again if you stay a while
- Free up your table when it gets busy
- Follow the place's laptop rules
- Keep calls short and quiet

**Own a café?**
You decide how laptops fit in your place. Set your laptop hours, or ask us to remove your place. We never charge for certification.

## Domande aperte
- [ ] Il codice del buon ospite va anche in scheda o solo in About e dopo il check-in?
- [ ] Opt-out del gestore: toglie solo la certificazione o nasconde del tutto il locale?
- [ ] Contattare qualche gestore prima del lancio?
- [x] ~~Eccezione linguistica (spagnolo/catalano) già al lancio o dopo?~~ → deciso 9 ott: EN, ES e CA al lancio
