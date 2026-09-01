# Risorse condivise e sistema UI Rainerum

## Obiettivo

Sostituire l'attuale bacheca di Intercomunica con una pagina che riunisca le risorse condivise visibili al docente e gli eventi già presenti, senza modificare il comportamento dei calendari. Allineare inoltre l'aspetto di Intercomunica, Prenotazioni e Orario affinché siano riconoscibili come servizi della stessa rete Rainerum.

## Criteri di accettazione

- La bacheca continua a mostrare gli eventi futuri visibili al docente con le categorie e il limite attuali.
- La bacheca mostra prima le risorse condivise visibili al docente, nell'ordine definito dagli admin.
- Ogni risorsa contiene soltanto un link HTTP/HTTPS e metadati testuali; non è previsto alcun caricamento di file.
- Una risorsa è visibile a tutti oppure a uno o più sottogruppi. Il filtro è applicato dal server.
- Gli admin possono creare, modificare, eliminare e riordinare le risorse.
- L'anteprima del link è opzionale. Quando è attiva, il server prova a recuperare titolo, immagine e nome del sito; l'admin può modificare titolo e descrizione.
- Un errore nel recupero dell'anteprima non impedisce il salvataggio di una risorsa con titolo manuale.
- Le Impostazioni di Intercomunica sono divise nelle tab `Calendario` e `Risorse condivise`.
- I tre servizi usano il marchio Rainerum ricorrente, superfici chiare e il rosso istituzionale come unico accento di prodotto.
- L'allineamento grafico non modifica rotte, autorizzazioni, flussi o comportamenti esistenti.
- `orario/main` incorpora prima il ramo `codex/pilot-foundation` tramite avanzamento lineare; le modifiche grafiche vengono poi effettuate su `main`.
- La produzione non viene migrata durante questo intervento.

## Non obiettivi

- Allegati, upload, gestione documentale o archiviazione di immagini recuperate.
- Editor WYSIWYG, categorie delle risorse, analytics dei click o scadenze automatiche.
- Un CMS esterno o un pacchetto UI condiviso fra i tre repository.
- Aggiornamento di Intercomunica da React 18 a React 19.
- Deploy o migrazione della produzione.

## Architettura delle risorse

### Modello dati

Intercomunica aggiunge il modello Prisma `SharedResource` e la relazione molti-a-molti `SharedResourceSubgroup`.

`SharedResource` contiene:

- `id`: identificatore CUID;
- `url`: URL canonico inserito dall'admin;
- `title`: titolo obbligatorio mostrato nella card;
- `description`: descrizione opzionale modificabile;
- `previewEnabled`: abilita il recupero e la visualizzazione dell'anteprima;
- `previewImageUrl`: URL opzionale dell'immagine Open Graph, non scaricata dall'app;
- `previewSiteName`: nome opzionale del sito sorgente;
- `isGlobal`: visibilità per tutti;
- `sortOrder`: intero usato per l'ordinamento stabile;
- `previewFetchedAt`: data opzionale dell'ultimo recupero riuscito;
- `createdAt` e `updatedAt`.

`SharedResourceSubgroup` usa la chiave composta `resourceId`/`subgroupId` e cancellazione a cascata. Una risorsa globale ignora le relazioni con i sottogruppi; una risorsa non globale richiede almeno un destinatario.

La migrazione è additiva e non modifica i modelli relativi a utenti, sottogruppi, eventi o calendari.

### Servizi e API

Un servizio `sharedResourceService` possiede validazione, persistenza, visibilità e riordinamento. Le route amministrative richiedono sempre `requireAdmin`.

API previste:

- `GET /api/admin/resources`: elenco completo ordinato per amministrazione;
- `POST /api/admin/resources/preview`: recupera un'anteprima senza salvare;
- `POST /api/admin/resources`: crea una risorsa;
- `PUT /api/admin/resources/:id`: aggiorna una risorsa;
- `DELETE /api/admin/resources/:id`: elimina una risorsa;
- `PUT /api/admin/resources/order`: salva l'ordine completo e normalizzato.

`GET /api/bacheca` restituisce un oggetto con `resources` e `eventSections`. Il servizio degli eventi e la sua logica di raggruppamento rimangono invariati; la composizione della risposta avviene nella route o in un servizio di facciata. Poiché il frontend e il backend vengono distribuiti insieme, la modifica del contratto è atomica.

La visibilità delle risorse segue la regola degli eventi: `isGlobal = true`, oppure almeno un sottogruppo della risorsa coincide con un sottogruppo dell'utente autenticato.

### Recupero sicuro delle anteprime

Il recupero accetta soltanto `http:` e `https:`. Prima di ogni richiesta e dopo ogni redirect il server risolve l'host e rifiuta loopback, link-local, multicast, indirizzi privati IPv4/IPv6 e nomi locali. Sono previsti timeout breve, numero massimo di redirect, limite alla dimensione della risposta e accettazione esclusiva di contenuti HTML.

Il parser legge i metadati Open Graph e, come fallback, il titolo HTML. I valori vengono trattati come testo non fidato e mai renderizzati come HTML. L'immagine resta un URL remoto; Intercomunica non la scarica né la trasforma. Errori di rete, formati non supportati o metadati assenti producono una risposta gestibile dalla UI e non bloccano il salvataggio manuale.

## Interfaccia Intercomunica

### Bacheca

La pagina usa questa gerarchia:

1. saluto e introduzione breve;
2. sezione `Risorse condivise` con card responsive;
3. sezione `Prossimi eventi` con le categorie esistenti.

Una card mostra l'immagine Open Graph quando l'anteprima è attiva e disponibile. In assenza di immagine usa una variante testuale con nome del sito o hostname. Titolo, descrizione e stato `Per tutti` rimangono leggibili in entrambi gli stati. I link si aprono in una nuova scheda con `rel="noopener noreferrer"`.

Lo stato vuoto distingue l'assenza di risorse dall'assenza di eventi, così una raccolta vuota non nasconde l'altra.

### Impostazioni

La route attuale resta `/admin/settings` e presenta due tab accessibili:

- `Calendario`: contiene tutte le impostazioni esistenti senza modificarne i flussi;
- `Risorse condivise`: contiene elenco, creazione e modifica.

L'editor comprende URL, comando per generare/aggiornare l'anteprima, interruttore di visualizzazione, titolo, descrizione, scelta `Tutti` oppure sottogruppi e salvataggio. La UI mostra la card risultante prima del salvataggio. Il riordinamento usa controlli espliciti `Sposta su` e `Sposta giù`, utilizzabili da tastiera, anziché richiedere il drag-and-drop.

Errori di validazione e rete sono mostrati vicino all'azione interessata e non cancellano i dati inseriti.

## Sistema grafico comune

### Identità

I tre servizi adottano un'unica direzione visiva:

- logo Rainerum completo nell'header desktop;
- simbolo compatto Rainerum nell'header mobile;
- nome del servizio come identificatore secondario;
- rosso istituzionale come unico colore d'accento;
- fondi chiari, testo ad alto contrasto, bordi e ombre leggere;
- stessa famiglia tipografica, scala dei titoli, spaziatura, raggi e focus visibile.

Non vengono assegnati colori diversi a Intercomunica, Prenotazioni e Orario. Le navigazioni mantengono etichette e destinazioni esistenti. L'intervento riusa le componenti presenti e modifica soltanto presentazione, classi e token necessari.

I due loghi ufficiali forniti dall'utente vengono copiati come asset locali ottimizzati in ciascun progetto che li usa; non vengono ridisegnati e non dipendono da Google Drive in produzione.

### Linea guida Lycoris

Le linee guida dei tre repository indicano [Lycoris](https://ui.lycoris.it/docs/introduction) come prima scelta per nuovi componenti e nuove superfici, previa verifica di compatibilità con runtime, React e pipeline di distribuzione. L'uso deve preferire componenti e token Lycoris, con adattatori locali quando il routing o le API del framework lo richiedono, evitando fork e copie interne dei componenti.

Orario usa già `@loreschaeffer/lyco-ui` 1.1.2 tramite un archivio versionato. La documentazione ufficiale corrente richiede React 19 e Node.js 25 per il target React. Prenotazioni usa React 19; Intercomunica usa React 18. Questo intervento non aggiorna React in Intercomunica e non forza una migrazione retroattiva: applica i token visivi comuni con lo stack esistente. L'adozione futura di Lycoris in Intercomunica richiederà una migrazione dedicata e verificata.

## Strategia per Orario

Nel repository `orario`, `main` non contiene commit divergenti rispetto a `codex/pilot-foundation`: il ramo è 122 commit avanti. Dopo l'approvazione del piano, `main` viene avanzato linearmente al ramo pilota. I file locali non tracciati (`.DS_Store`, `AGENTS.md`, `CLAUDE.md`) non vengono aggiunti al merge.

Il ramo pilota diventa così la base canonica. Le modifiche estetiche successive sono effettuate direttamente su `main`. Il ramo remoto non viene eliminato e la produzione non viene modificata.

## Verifica

Lo sviluppo delle nuove funzioni segue cicli test-first. La verifica copre:

- autorizzazione admin per ogni mutazione;
- creazione, modifica, eliminazione e ordine stabile;
- risorse globali e visibilità per sottogruppi;
- rifiuto di URL non HTTP/HTTPS e destinazioni di rete non pubbliche;
- redirect nuovamente validati, timeout e limiti di risposta;
- fallback manuale quando l'anteprima fallisce;
- contratto aggregato della bacheca e regressione delle sezioni evento;
- stati vuoti, errori e controlli accessibili della UI;
- test, typecheck, lint e build disponibili nei tre repository;
- controllo responsive su desktop e mobile e navigazione da tastiera.

L'accesso dell'utente verrà richiesto soltanto se la verifica visiva delle aree riservate non può essere completata con gli strumenti locali. La consegna dichiara separatamente eventuali controlli non eseguibili senza credenziali o servizi esterni.
