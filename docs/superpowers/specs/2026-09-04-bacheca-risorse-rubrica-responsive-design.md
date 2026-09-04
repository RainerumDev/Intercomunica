# Bacheca, risorse e rubrica responsive

## Obiettivo

Riorganizzare Intercomunica in quattro aree riconoscibili — `Bacheca`, `Risorse`, `Calendario` e `Gruppi e docenti` — affinché ogni pagina abbia un compito unico e sia efficace sia su telefono sia su desktop. La bacheca diventa un flusso cronologico essenziale, le risorse escono completamente dalla bacheca e la rubrica sostituisce le tabelle mobili con elenchi e dettagli leggibili.

La modifica preserva le autorizzazioni esistenti e usa i dati già disponibili, salvo due estensioni mirate: la bacheca deve ricevere tutti gli eventi futuri visibili e le risorse possono mostrare un'immagine di anteprima recuperata in sicurezza dal server.

Questa specifica sostituisce, limitatamente alla composizione della bacheca e alle immagini delle risorse, le decisioni della specifica `2026-09-01-shared-resources-and-rainerum-ui-design.md`. Le altre garanzie di quella specifica, incluse visibilità, amministrazione e sicurezza degli URL, restano valide.

## Criteri di accettazione

- La navigazione autenticata contiene `Bacheca`, `Risorse`, `Calendario` e `Gruppi e docenti`; `Impostazioni` compare soltanto agli amministratori.
- Desktop e mobile condividono rotte, dati e significato delle azioni, ma adottano composizioni adatte allo spazio disponibile.
- La bacheca non contiene risorse o collegamenti ai calendari.
- Il backend della bacheca restituisce tutti gli eventi futuri visibili, raggruppati per categoria e senza il precedente limite di tre eventi per categoria.
- La bacheca mostra inizialmente tutti gli eventi di oggi e i primi sei eventi successivi, ordinati cronologicamente e senza duplicati.
- `Mostra altri` aggiunge sei prossimi eventi alla volta. Durante una ricerca non viene applicato alcun limite ai risultati.
- La ricerca della bacheca considera l'intero insieme degli eventi futuri ricevuti, compresi quelli lontani nel tempo e non mostrati inizialmente.
- La pagina Risorse contiene i collegamenti ai calendari e tutte le risorse condivise visibili, nell'ordine amministrativo esistente.
- La ricerca Risorse è esclusivamente testuale. Non vengono introdotti filtri, preferiti, categorie o ordinamenti non sostenuti dal backend.
- Quando disponibile, una risorsa mostra un'immagine di anteprima servita dall'applicazione; in mancanza dell'immagine usa una variante grafica testuale, non un'emoji.
- Il Calendario conserva i filtri esistenti e non aggiunge una ricerca testuale.
- La pagina `Gruppi e docenti` usa due schede, `Docenti` e `Gruppi`, con ricerca locale coerente con la scheda attiva.
- Su mobile i docenti sono presentati come una rubrica alfabetica, senza tabelle orizzontali.
- Su desktop Docenti e Gruppi usano una struttura master–detail: elenco a sinistra e dettaglio a destra.
- Il dettaglio di un gruppo mostra immediatamente l'elenco completo dei membri; non presenta `Mostra tutti`.
- Il comando `Invia email al gruppo` si trova in fondo al dettaglio, dopo l'elenco dei membri.
- Colore, indirizzo tecnico del gruppo e ultimo aggiornamento non compaiono nella consultazione ordinaria; sono disponibili solo nell'editor amministrativo.
- Non viene introdotto alcun pulsante generico `Gestisci`: le azioni amministrative sono esplicite e contestuali.

## Non obiettivi

- Modificare la logica o l'interfaccia del Calendario oltre alla navigazione comune.
- Introdurre ricerca server-side, paginazione API o caricamento progressivo degli eventi: il volume attuale consente un unico caricamento degli eventi futuri visibili.
- Aggiungere analytics, conteggio utilizzi, `Più usate`, preferiti o categorie alle risorse.
- Cambiare i permessi di consultazione, invio email, creazione, modifica o eliminazione di gruppi e appartenenze.
- Modificare la sincronizzazione Google, le sottoscrizioni calendario o la composizione delle email.
- Effettuare il deploy in produzione.

## Architettura dell'informazione e rotte

Le responsabilità delle pagine sono:

| Rotta | Voce | Responsabilità |
| --- | --- | --- |
| `/` | Bacheca | Eventi personali futuri, ordinati per tempo e ricercabili |
| `/risorse` | Risorse | Collegamenti calendario e risorse condivise |
| `/calendario` | Calendario | Vista calendario e filtri già esistenti |
| `/directory` | Gruppi e docenti | Rubrica docenti, gruppi e relativi dettagli |
| `/admin/settings` | Impostazioni | Configurazione riservata agli amministratori |

La route `/risorse` è nuova. La pagina Bacheca perde `CalendarResources` e `ResourceCard`; una nuova pagina Risorse ne assume la responsabilità. `GET /api/bacheca` continua temporaneamente a poter restituire `resources` durante la transizione atomica, ma il frontend non le usa più dalla bacheca. Al termine della modifica il contratto canonico della bacheca contiene soltanto le sezioni evento, mentre Risorse usa gli endpoint dedicati già esistenti e `/api/calendar-links`.

Su desktop la navigazione resta nell'intestazione. Su mobile diventa una barra inferiore persistente: quattro voci per i docenti e cinque per gli amministratori, con `Impostazioni` come quinta voce. Il logo ufficiale Rainerum usa la stessa coppia di asset già adottata dal progetto Orario.

## Bacheca

### Dati dal backend

`eventSectionsForUser` mantiene l'attuale filtro di visibilità:

- evento globale; oppure
- evento assegnato ad almeno un sottogruppo dell'utente.

La query continua a selezionare gli eventi con `endsAt >= now` e a ordinarli per `startsAt` crescente. `buildSections` non tronca più ogni categoria a tre elementi: ogni `BachecaSection` contiene tutti gli eventi futuri visibili associati alla categoria. Gli eventi senza tag restano nella categoria `ALTRO`.

Un evento con più tag compare nelle rispettive sezioni del payload. Prima della visualizzazione, il frontend costruisce un indice per `event.id` e ottiene una sequenza cronologica senza duplicati; l'elenco dei tag dell'evento resta disponibile per badge, filtri e ricerca. Questo conserva il raggruppamento per categoria richiesto al backend evitando card duplicate nel flusso principale.

### Presentazione e interazioni

La pagina usa una singola colonna centrale anche su desktop, più larga della variante mobile. La gerarchia è:

1. data completa, saluto e breve introduzione;
2. campo di ricerca;
3. filtro `Tutti` seguito dalle categorie realmente presenti nel payload;
4. sezione `Oggi`, con tutti gli eventi odierni corrispondenti;
5. sezione `Prossimi eventi`, con sei risultati iniziali e `Mostra altri` a blocchi di sei.

Le card desktop sono righe orizzontali e mostrano data, titolo, orario, luogo, categorie e destinatari utili. Su mobile gli stessi dati sono impilati, mantenendo titolo e orario ad alto contrasto. Le categorie usano il colore configurato; il colore è un rinforzo visivo e non l'unico modo per comprenderle.

La ricerca è un filtro client-side sull'intero payload futuro e considera titolo, descrizione, luogo e nomi delle categorie, senza distinzione tra maiuscole, minuscole o accenti. Quando la ricerca contiene testo:

- vengono cercati anche gli eventi molto futuri normalmente esclusi dai primi sei;
- il limite e `Mostra altri` scompaiono;
- restano le sezioni temporali `Oggi` e `Prossimi eventi` quando contengono risultati;
- uno stato vuoto spiega che nessun evento corrisponde alla ricerca.

Il filtro di categoria si combina con la ricerca. Cambiare ricerca o categoria riporta l'espansione dei prossimi eventi al valore iniziale.

## Risorse

La pagina usa una colonna centrale su mobile e una composizione più ampia su desktop. Contiene:

1. titolo e introduzione;
2. ricerca testuale;
3. sezione Calendari con i collegamenti personale e generale gestiti da `CalendarResources`;
4. griglia delle risorse condivise visibili.

Su desktop le risorse formano una griglia a tre colonne; la griglia scende a due e poi a una colonna in base alla larghezza. L'ordine è esclusivamente `sortOrder`, già governato dagli amministratori. La ricerca considera titolo, descrizione, nome del sito e hostname; non altera l'ordine relativo dei risultati.

### Anteprime delle risorse

La card dedica la parte superiore all'anteprima visiva. Il browser non carica mai direttamente immagini arbitrarie indicate da siti esterni. Durante il recupero amministrativo dei metadati, il server può acquisire l'immagine Open Graph seguendo gli stessi controlli SSRF applicati alla pagina: protocolli HTTP/HTTPS, nuova validazione dopo ogni redirect, rifiuto di reti private e locali, timeout, limite di byte e MIME immagine consentiti.

L'immagine validata viene memorizzata dall'applicazione insieme al MIME e servita da un endpoint autenticato basato sull'identificatore della risorsa. La persistenza deve essere compatibile con i container senza dipendere dal filesystem effimero; l'opzione prevista è un campo binario PostgreSQL con dimensione massima esplicita. Aggiornare o disabilitare l'anteprima sostituisce o elimina il contenuto memorizzato. L'URL sorgente non viene esposto come sorgente immagine al browser.

Se l'immagine non esiste o il recupero fallisce, la card mostra titolo, hostname e una superficie cromatica neutra. Il salvataggio manuale della risorsa rimane possibile. Link esterni continuano ad aprirsi con `noopener noreferrer`.

## Gruppi e docenti

### Struttura comune

La pagina usa l'intestazione `Rubrica`, un selettore `Docenti`/`Gruppi` e un campo di ricerca relativo alla scheda attiva. La selezione della scheda è conservata nel parametro URL `tab=teachers|groups`, così navigazione indietro e link diretti mantengono il contesto. La ricerca rimane nello stato locale e non modifica gli endpoint.

Le operazioni esistenti rimangono disponibili secondo il ruolo. Gli utenti possono consultare i dati già concessi loro; gli amministratori vedono i comandi espliciti per creare, modificare ed eliminare e possono gestire le appartenenze. `Invia email` compare soltanto quando l'autorizzazione già esistente lo consente.

### Docenti

La ricerca considera nome, email e gruppi. I filtri rapidi sono `Tutti`, `Docenti medie`, `Docenti superiori` e `I miei gruppi`; quest'ultimo mostra i docenti che condividono almeno un gruppo con l'utente corrente. I filtri vengono calcolati dalle appartenenze già ricevute, senza introdurre nuovi campi. I nomi delle cartelle e dei gruppi usati per riconoscere medie e superiori sono centralizzati in una funzione pura e coperti da test, evitando controlli testuali sparsi nella UI.

Su mobile l'elenco è alfabetico, con iniziali, nome e il dato secondario più utile. Un indice alfabetico laterale può portare alle lettere presenti. Selezionare una persona apre un dettaglio a pagina intera con email e gruppi; il ritorno ripristina ricerca e posizione dell'elenco.

Su desktop l'elenco alfabetico occupa la colonna sinistra e il dettaglio della persona selezionata occupa la colonna destra. Il dettaglio inizia alla stessa altezza del selettore, sfruttando lo spazio accanto ad esso. In assenza di selezione viene selezionato il primo risultato; se non esistono risultati compare uno stato vuoto nella colonna di dettaglio.

### Gruppi

La ricerca considera nome e cartella. L'elenco è organizzato per cartella usando l'ordinamento corrente; ogni gruppo mostra nome, tipo/cartella, colore e numero completo di membri.

Su mobile la selezione apre un dettaglio a pagina intera. Su desktop elenco e dettaglio sono affiancati; la colonna di dettaglio sale accanto al selettore `Docenti`/`Gruppi`, mentre ricerca ed elenco rimangono nella colonna sinistra. Il dettaglio mostra:

- nome, descrizione e cartella;
- tutti i membri immediatamente, senza collasso o `Mostra tutti`;
- `Invia email al gruppo` in fondo all'elenco;
- modifica ed eliminazione come azioni amministrative esplicite.

Colore esadecimale, indirizzo tecnico e data di aggiornamento non sono presentati in consultazione. I valori necessari all'amministrazione compaiono nell'editor, insieme a nome, cartella, descrizione e appartenenze. Il comando di creazione è `Nuovo gruppo` su desktop e un pulsante flottante etichettato in modo accessibile su mobile.

## Stati, errori e accessibilità

Ogni pagina distingue caricamento, errore e assenza di risultati. Un errore nella bacheca non impedisce di navigare alle altre aree; in Risorse gli errori dei collegamenti calendario e delle risorse sono indipendenti. I campi di ricerca mantengono un'etichetta accessibile e includono un comando per cancellare il testo quando non è vuoto.

Schede, filtri e righe selezionabili sono elementi interattivi nativi con focus visibile, `aria-current`, `aria-selected` o stato equivalente. Le azioni a sola icona hanno un nome accessibile. I target mobili sono almeno 44×44 CSS pixel. Il contenuto resta utilizzabile al 200% di zoom e non richiede scorrimento orizzontale alle larghezze mobili supportate. Le immagini di anteprima hanno testo alternativo vuoto quando decorative, perché titolo e sito sono già presenti nella card.

## Componenti e confini

La riorganizzazione mantiene unità con responsabilità singola:

- `Bacheca`: carica e orchestra eventi, ricerca, categoria e limite di presentazione;
- `EventStream` e `EventRow`: presentazione cronologica riutilizzabile tra breakpoint;
- `Risorse`: orchestra risorse e collegamenti calendario;
- `ResourceCard`: anteprima, metadati e link;
- `Directory`: possiede scheda attiva, ricerca e selezione;
- `TeacherDirectory`/`TeacherDetail`: elenco e dettaglio docenti;
- `GroupDirectory`/`GroupDetail`: elenco e dettaglio gruppi;
- funzioni pure: deduplicazione e filtro eventi, raggruppamento alfabetico, filtri docenti e raggruppamento gruppi.

Le mutazioni amministrative restano nei componenti/editor dedicati. La pagina Directory coordina il ricaricamento dei dati e la selezione, senza duplicare chiamate API nei componenti di presentazione.

## Compatibilità e transizione

Frontend e backend vengono distribuiti insieme. La trasformazione del payload della bacheca è comunque eseguita in due passaggi interni per ridurre il rischio:

1. rimuovere il limite server mantenendo forma e campi di `eventSections`, aggiungere i test e aggiornare il frontend;
2. spostare Risorse sulla route dedicata e rimuovere `resources` dal tipo e dal payload della bacheca soltanto dopo che nessun consumatore lo usa.

La migrazione dell'immagine di anteprima è additiva e nullable. Le risorse esistenti restano valide e usano il fallback finché un amministratore non aggiorna l'anteprima. Nessuna migrazione distruttiva è necessaria.

## Verifica

Lo sviluppo segue test-first. La verifica automatica comprende:

- filtro di visibilità degli eventi invariato;
- sezioni complete, ordine stabile e categoria `ALTRO`;
- deduplicazione degli eventi con più tag;
- distinzione tra oggi e prossimi eventi nel fuso configurato;
- ricerca completa, combinazione con categoria e incremento di `Mostra altri`;
- route e stato attivo delle nuove voci di navigazione, incluso `Impostazioni` solo per admin;
- spostamento integrale di risorse e calendari fuori dalla bacheca;
- ricerca Risorse senza filtri inesistenti;
- validazione, limiti, persistenza e accesso autenticato alle immagini di anteprima;
- ricerca, raggruppamento, selezione e stati vuoti di Docenti e Gruppi;
- elenco completo dei membri e posizione finale del comando email;
- azioni amministrative assenti per i docenti e presenti per gli admin;
- focus, nomi accessibili e navigazione da tastiera.

La verifica conclusiva esegue test, typecheck e build di server e web, quindi controlla visivamente almeno queste larghezze: 375 px, 768 px, 1024 px e 1440 px. Il controllo usa dati con eventi multi-tag, eventi molto futuri, risorse con e senza anteprima, docenti senza gruppo, cartelle numerose e gruppi con molti membri.
