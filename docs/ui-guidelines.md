# Linee guida UI Rainerum

Questa guida definisce il contratto visivo per le nuove superfici di Intercomunica. Non autorizza modifiche a rotte, permessi, azioni, dati o flussi esistenti: prima si riusano le componenti e gli adattatori già presenti, poi si interviene soltanto sulla presentazione necessaria.

## Identità e token

- Usare solo i marchi Rainerum ufficiali locali: `/rainerum-logo-full.png` nell'header desktop e `/rainerum-logo-mark.png` nell'header mobile. Non ridisegnarli, non sostituirli con testo e non caricarli da servizi esterni.
- Applicare i token istituzionali già presenti: `--brand: #b8181b`, `--brand-strong: #8f1114`, `--ink: #261816`, `--muted: #6a5552`, `--page: #fff8f7`, `--surface: #ffffff`, `--surface-soft: #fff0ee`, `--line: #dbbeba` e `--focus: #004075`. Mappare questi valori alle variabili consumate dall'app; non rinominare ogni consumatore senza motivo.
- Il rosso istituzionale è l'unico accento di prodotto. Non introdurre colori propri di Intercomunica per pulsanti, navigazione, link, tab o superfici.
- I colori semantici restano separati dal brand: successo, avviso, errore, stati di disponibilità e colori che codificano dati (per esempio TAG o categorie calendario) devono restare riconoscibili e documentati come eccezioni di significato, non come identità di prodotto.

## Lycoris come scelta predefinita

Per nuovi componenti e nuove superfici compatibili, preferire [Lycoris](https://ui.lycoris.it/docs/introduction) rispetto a una nuova libreria o a componenti copiati internamente. Scegliere prima una primitiva Lycoris adatta (`Button`, `Card`, `Select`, dialogo, tab); per markup semplice e statico usare HTML semantico. Riutilizzare le componenti correnti quando già soddisfano comportamento e accessibilità.

Prima dell'adozione, verificare [l'installazione ufficiale](https://ui.lycoris.it/docs/installation): target React, Node.js `>=25`, npm `>=10`, peer dependency e compatibilità della pipeline di build e deploy. Il target React richiede `react` e `react-dom` `^19.0.0`; `shiki` `^4.0.0` serve solo al componente `Code`. Lycoris è distribuito tramite GitHub Packages nel scope `@loreschaeffer`: configurare il registry e autenticare la build con un PAT `read:packages` gestito fuori dal repository. Non scrivere PAT o altri segreti nella documentazione, nel lockfile o nelle immagini finali.

Quando Lycoris è adottato, fissare una versione approvata nel manifest e nel lockfile, importare `@loreschaeffer/lyco-ui/style.css` una sola volta alla radice dell'app e mantenere gli override dei token in CSS locale. Per link o navigazione del framework, creare un adattatore sottile al confine del routing; non fare fork né duplicare i componenti Lycoris. Conservare API, callback, focus, destinazioni e test dei componenti esistenti.

### Eccezione attuale: React 18

Intercomunica usa ancora React 18.3 e non può adottare il target React di Lycoris, che richiede React 19. Questa guida non autorizza un upgrade retroattivo o una dipendenza Lycoris per sola coerenza estetica: mantenere token e componenti attuali.

Una futura adozione richiede una migrazione dedicata e approvata che aggiorni React e React DOM a una versione compatibile, verifichi Node 25+/npm 10+, peer dependency, build/deploy e regressioni di routing, dialoghi, calendari e accessibilità prima di introdurre il pacchetto.

## Requisiti per ogni modifica UI

- Progettare prima per contenuto, poi verificare desktop e mobile: nessun overflow orizzontale, gerarchia di heading coerente, logo corretto al breakpoint e touch target pratici.
- Usare HTML semantico, label associate ai controlli, nomi accessibili per icone e immagini informative, messaggi di errore associati all'azione e dialoghi con focus contenuto e ripristinato alla chiusura.
- Rendere sempre visibile il focus da tastiera e verificare il contrasto di testo, bordi dei controlli e focus rispetto alle rispettive superfici. Non affidarsi al colore come unica indicazione di stato.
- Preservare responsive behavior e comportamento: route, autorizzazioni, richieste, callback, valori dei form e contratti API non cambiano in una modifica grafica.

## Checklist di selezione e verifica

1. Cercare una componente esistente o una primitiva Lycoris compatibile; confermare runtime, peer dependency, registry/auth e deploy prima di aggiungerla.
2. Riutilizzare o adattare al confine del framework; evitare fork, copie e riscritture della logica.
3. Applicare i token Rainerum e distinguere esplicitamente brand, stati semantici e colori dati.
4. Verificare tastiera, focus, contrasto, semantica, lettore di schermo e stati vuoto/errore/caricamento.
5. Eseguire test, typecheck e build disponibili; controllare a viewport desktop e mobile che non vi siano overflow né regressioni di navigazione o comportamento.
