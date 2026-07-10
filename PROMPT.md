# Documento dei Requisiti di Prodotto (PRD)



## Progetto: Intercomunica - Rainerum



**Destinatario dello Sviluppo:** Claude Fable 5 (Autonomo)

**Obiettivo:** Progettazione e implementazione di un'applicazione web per l'orchestrazione di Google Calendar, la gestione di sottogruppi di docenti, l'invio mirato di comunicazioni email e una bacheca eventi dinamica.



---



### 1. Architettura di Sistema e Stack Tecnologico Consigliato



Per consentire un'esecuzione autonoma e scalabile, l'applicazione deve prevedere:



* **Backend:** Node.js (TypeScript) con Express o Python (FastAPI), ideale per gestire le integrazioni asincrone con le API di Google Workspace.

* **Frontend:** React.js o Vue.js con una libreria di componenti pronta (es. Tailwind CSS, shadcn/ui) per garantire un'interfaccia pulita e reattiva.

* **Database:** PostgreSQL o MongoDB per memorizzare l'alberatura dei sottogruppi, i metadati degli eventi, i TAG e i log di sincronizzazione.

* **Integrazioni Google Workspace:**

* Google OAuth 2.0 (Autenticazione e Autorizzazione con Scopes specifici).

* Google Directory API (per la lettura dei membri dei Google Groups).

* Google Calendar API (per la creazione e gestione dei calendari e degli eventi).

* Gmail API o servizio SMTP dedicato per l'invio delle email.







---



### 2. Flusso 1: Inizializzazione e Sincronizzazione Account



Questo flusso permette la configurazione iniziale dell'applicazione da parte del super-amministratore del workspace dell'istituto.



1. **Collegamento dell'Account Master:**

* L'utente amministratore collega l'account istituzionale delegato (es. `comunicazione@rainerum.it`) tramite **Google OAuth 2.0**.

* I permessi richiesti (*Scopes*) devono includere la gestione dei calendari, la lettura dei gruppi di dominio e l'invio di email.





2. **Selezione del Google Group Principale:**

* Dall'interfaccia di configurazione, l'amministratore seleziona il gruppo Google di riferimento che contiene tutti i docenti (es. `docenti@rainerum.it`).

* L'applicazione interroga la *Directory API* di Google per recuperare la lista aggiornata di tutti i membri appartenenti a quel gruppo.





3. **Orchestrazione e Creazione dei Calendari:**

* Per ciascun membro identificato nel gruppo Google, l'applicazione crea programmaticamente un nuovo calendario all'interno dell'account master (`comunicazione@rainerum.it`).

* **Condivisione e Permessi:** Ogni calendario viene condiviso con il rispettivo docente impostando i permessi in modalità **Sola Lettura** (`reader`).

* L'applicazione memorizza nel database la mappatura tra l'ID del docente (email) e l'ID del Google Calendar generato. L'applicazione agisce come unico orchestratore (proprietario dei calendari con permessi di scrittura).





4. **Funzione di Allineamento (Tasto "Refresh"):**

* Viene predisposto un pulsante "Sincronizza / Refresh" nella dashboard di amministrazione.

* Al click, il sistema esegue un ciclo di controllo:

* Identifica ed inserisce i nuovi membri aggiunti al Google Group creando il loro calendario.

* Verifica la corrispondenza e l'integrità di tutti gli eventi sul database rispetto a quelli effettivamente presenti sui calendari di Google, sanando eventuali discrepanze.











---



### 3. Flusso 2: Creazione e Gestione Gruppi Docenti (Sottogruppi)



Permette di segmentare i membri del Google Group principale in categorie operative interne alla scuola.



1. **Definizione dei Sottogruppi:**

* All'interno dell'applicazione è possibile creare sottogruppi personalizzati che rappresentano divisioni logiche dei docenti (es. *Consiglio di Classe 1A*, *Staff Scuola*, *Docenti Scuola Media*, *Dipartimento di Matematica*).

* Un singolo docente può fare parte simultaneamente di **più sottogruppi** (relazione molti-a-molti).





2. **Interfaccia di Gestione Anagrafica:**

* Una schermata dedicata mostra l'elenco completo dei membri recuperati dal Google Group.

* Accanto a ogni nome è presente un pannello per associare o rimuovere rapidamente il docente dai diversi sottogruppi (es. tramite tag visivi o checkbox).

* L'interfaccia deve permettere la ricerca rapida per nome, email o sottogruppo.







---



### 4. Flusso 3: Aggiunta e Modifica degli Eventi



Flusso operativo riservato alla presidenza e alla direzione per pianificare le attività scolastiche.



1. **Controllo Accessi Amministrativo:**

* Possono accedere a questa sezione esclusivamente gli utenti con ruoli abilitati (Preside, Vicepresidi, Tecnici, Direttore - es. `presidenza@rainerum.it`) autenticati tramite Google OAuth.





2. **Interfaccia Calendario:**

* Schermata stile *Google Calendar* (visualizzazione mensile, settimanale, giornaliera e a elenco).

* Al click su uno slot orario si apre un modulo di creazione evento intuitivo.





3. **Logica di Condivisione e Iniezione Eventi:**

* Nel modulo dell'evento l'utente seleziona uno o più **Sottogruppi** destinatari.

* Al salvataggio, l'applicazione individua tutti i docenti appartenenti ai sottogruppi selezionati e, tramite le API di Google, inserisce l'evento nei rispettivi calendari condivisi in modo automatico e trasparente.

* **Flessibilità delle API:** Sfruttare appieno i campi nativi delle API di Google Calendar (`summary`, `description`, `location`, `start/end time`) e utilizzare le `extendedProperties` (proprietà private dell'app) per salvare i metadati interni come i ID dei sottogruppi e i TAG.





4. **Gestione TAG e Logica della Bacheca Globale:**

* Ogni evento può essere associato a uno o più **TAG** personalizzati (es. "RIUNIONI", "GITE", "CORSI").

* **Flag "Visibile a tutti" (Evento Globale):**

* Se la spunta è *disattivata*, l'evento segue il flusso standard (appare solo nei calendari dei docenti nei sottogruppi selezionati).

* Se la spunta è *attivata*, l'evento assume carattere generale (es. uscite didattiche che non riguardano una classe specifica). In questo caso, l'evento **NON viene inserito** nei singoli calendari dei professori, ma viene salvato nel database dell'app per essere mostrato esclusivamente nella bacheca del sito (es. nella sezione "GITE").











---



### 5. Flusso 4: Modulo Email



Fornisce uno strumento di comunicazione rapido e centralizzato per tutti i membri della piattaforma.



1. **Accesso alla Directory:**

* Tutti i docenti del gruppo possono accedere alla piattaforma tramite Google OAuth.

* Visualizzano un'interfaccia pulita con l'elenco di tutti i gruppi, sottogruppi e relativi componenti (modalità consultazione).





2. **Composizione Email Rapida per Sottogruppo:**

* In corrispondenza di ogni sottogruppo è presente un pulsante "Invia Email".

* Al click si apre un client di invio integrato dove i destinatari sono pre-popolati con i membri di quel sottogruppo.

* **Opzioni di Invio:** L'utente può scegliere tramite selettore se inserire i membri nel campo **A:** (To) oppure **CCN:** (Bcc). Il valore predefinito deve essere impostato su **A:**.







---



### 6. Flusso 5: Bacheca (Dashboard - Homepage)



L'hub informativo principale visibile dai docenti non appena effettuano l'accesso all'applicazione.



1. **Visualizzazione Personalizzata:**

* Quando un docente si autentica su "Intercomunica - Rainerum", il sistema identifica i sottogruppi di cui fa parte.





2. **Regola dei Primi 3 Impegni per TAG:**

* La homepage è organizzata in sezioni verticali o griglie divise per **TAG** (es. Sezione "RIUNIONI", Sezione "GITE", ecc.).

* Sotto ogni TAG, il docente vede al massimo i **primi 3 impegni cronologicamente imminenti**, a patto che:

* L'evento sia stato condiviso con un sottogruppo a cui il docente appartiene.

* *Oppure*, l'evento abbia il flag "Visibile a tutti" attivo (es. l'evento globale memorizzato nella bacheca "GITE").











---



### 7. Sezioni Future e Integrazioni [WORK IN PROGRESS - WIP]



*Le seguenti sezioni descrivono funzionalità non prioritarie per la prima release, ma l'architettura software sviluppata da Claude Fable 5 deve essere predisposta (es. modelli di database pronti o interfacce vuote/mute) per accoglierle.*



#### WIP A: Modulo Anagrafica Studenti e Comunicazione Famiglie



* **Descrizione:** Gestione dei record degli studenti suddivisi per classe.

* **Funzionalità future:** Predisposizione di filtri per l'invio massivo di email basati su:

* *Anno di corso* (es. tutte le prime).

* *Indirizzo di studio* (es. Liceo Scientifico vs Istituto Tecnico Tecnologico - ITT).

* *Grado di istruzione* (es. Scuola Media vs Scuola Superiore).





* **Opzione Genitori:** Possibilità di flaggare l'invio della comunicazione anche ai rispettivi genitori degli studenti selezionati.

* **Modalità di Invio predefinita:** Scelta tra "A:" e "CCN:", con valore predefinito tassativamente impostato su **CCN:** per ragioni di privacy.



#### WIP B: Modulo Compleanni, Onomastici e Segnaletica Digitale (Digital Signage)



* **Descrizione:** Tabella del database contenente le date di nascita e gli onomastici di tutto il personale e degli studenti.

* **Funzionalità future:**

* Widget in bacheca che mostra i festeggiati del giorno corrente (Nome, Cognome, specifica se Docente o Studente con relativa Classe).

* Sviluppo di un **Endpoint API protetto** e di un corrispondente **Feed RSS**. Questo output verrà consumato dai software di digital signage della scuola per proiettare automaticamente la grafica dei compleanni del giorno sugli schermi dei corridoi e dell'atrio.







#### WIP C: Integrazione Software Gestionale dell'Orario Scolastico



* **Descrizione:** Modulo di importazione dati per connettere l'applicazione con il software di terze parti usato dall'istituto per la generazione dell'orario scolastico (es. Untis, EDT, o similari).

* **Funzionalità future:** Un'API di ricezione (webhook o endpoint POST) in grado di accettare file strutturati (JSON/CSV) contenenti l'orario settimanale delle lezioni. Il sistema dovrà convertire automaticamente questi record in eventi ricorrenti inserendoli direttamente nel Google Calendar del singolo docente, riducendo a zero la configurazione manuale.