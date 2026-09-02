import { Link } from "react-router-dom";

const TECHNICAL_EMAIL = "intercomunica.rainerum@delugan.net";

export default function Privacy() {
  return (
    <article className="legal-document">
      <header className="legal-document__header">
        <Link to="/" aria-label="Intercomunica Rainerum" className="legal-brand">
          <img src="/rainerum-logo-full.png" alt="" aria-hidden="true" />
          <span>Intercomunica</span>
        </Link>
        <p className="legal-document__eyebrow">Bozza 1.1 · aggiornata al 3 settembre 2026</p>
        <h1>Informativa privacy di Intercomunica</h1>
        <p>
          Informativa specifica per la piattaforma di comunicazione interna, calendario e risorse
          del Rainerum.
        </p>
      </header>

      <section>
        <h2>Titolare del trattamento</h2>
        <p>
          <strong>Rainerum è il titolare del trattamento</strong> e decide finalità, modalità,
          contenuti, autorizzazioni e gestione dei dati trattati tramite Intercomunica.
        </p>
      </section>

      <section>
        <h2>Fornitore tecnico</h2>
        <p>
          <strong>Kevin Delugan Dev è il fornitore tecnico</strong> della piattaforma per conto del
          Rainerum e può essere contattato all’indirizzo{" "}
          <a href={`mailto:${TECHNICAL_EMAIL}`}>{TECHNICAL_EMAIL}</a>. Non è il titolare del
          trattamento; un eventuale ruolo di responsabile del trattamento sussiste soltanto se
          formalizzato per iscritto dal Rainerum.
        </p>
      </section>

      <section>
        <h2>Dati trattati e finalità</h2>
        <p>
          Intercomunica tratta i dati del profilo Google usati per l’accesso — nome, email
          istituzionale e, se disponibile, immagine del profilo — insieme a ruolo, stato
          dell’account e appartenenze a gruppi e sottogruppi.
        </p>
        <p>
          La piattaforma gestisce eventi e calendari, inclusi titolo, descrizione, luogo, date,
          orari, destinatari, tag e autore; gestisce inoltre directory, log di sincronizzazione e
          risorse condivise, con URL, titolo, descrizione, anteprima e pubblico destinatario.
        </p>
        <p>
          Questi dati servono ad autorizzare l’accesso, organizzare i docenti, mostrare bacheca e
          calendario, condividere risorse, sincronizzare le informazioni e inviare comunicazioni
          ai destinatari selezionati.
        </p>
        <p>
          Il codice espone inoltre i seguenti trattamenti, anche se le relative funzioni sono
          indicate come in predisposizione. Per ciascuno sono riportati dati, finalità e canale di
          accesso attualmente implementati.
        </p>
      </section>

      <section>
        <h2>Anagrafica studenti e tutori</h2>
        <p>
          <strong>Dati:</strong> nomi e cognomi degli studenti, eventuale email, classe, anno di
          corso, indirizzo, livello scolastico, data di nascita e onomastico; per i tutori
          associati, nome e email.
        </p>
        <p>
          <strong>Finalità:</strong> gestire l’anagrafica scolastica e il collegamento tra studenti
          e tutori.
        </p>
        <p>
          <strong>Accesso:</strong> il canale API di consultazione è riservato soltanto agli
          amministratori autenticati.
        </p>
      </section>

      <section>
        <h2>Compleanni e onomastici</h2>
        <p>
          <strong>Dati:</strong> per docenti e studenti possono essere memorizzati data di nascita
          e onomastico. L’endpoint attivo calcola i compleanni dalla sola data di nascita;
          l’onomastico è predisposto ma non viene distribuito da questo endpoint.
        </p>
        <p>
          <strong>Finalità:</strong> formare l’elenco dei compleanni del giorno per la bacheca.
        </p>
        <p>
          <strong>Accesso:</strong> il canale della bacheca è disponibile agli utenti autenticati.
        </p>
      </section>

      <section>
        <h2>Bacheca e digital signage</h2>
        <p>
          <strong>Dati:</strong> nome del docente o studente festeggiato, indicazione del tipo di
          persona e, per lo studente, classe di appartenenza.
        </p>
        <p>
          <strong>Finalità:</strong> distribuire i compleanni del giorno sulla bacheca e sui sistemi
          di digital signage.
        </p>
        <p>
          <strong>Accesso:</strong> oltre alla bacheca autenticata, è disponibile un feed RSS per
          il software di segnaletica, protetto da un token statico configurato dal gestore.
        </p>
      </section>

      <section>
        <h2>Importazione dell’orario</h2>
        <p>
          <strong>Dati:</strong> nome del sistema sorgente e payload JSON ricevuto. Lo schema
          accetta il contenuto del payload senza limitarlo a campi specifici, che devono quindi
          essere definiti e verificati prima dell’uso in produzione.
        </p>
        <p>
          <strong>Finalità:</strong> registrare l’importazione in attesa della conversione in eventi
          ricorrenti dell’orario scolastico.
        </p>
        <p>
          <strong>Accesso:</strong> il canale API di importazione è riservato soltanto agli
          amministratori autenticati.
        </p>
      </section>

      <section>
        <h2>Sessione e integrazioni</h2>
        <p>
          L’accesso usa Google OAuth e una sessione tecnica dell’applicazione. Le funzioni
          configurate possono consultare Google Groups o Directory, sincronizzare Google Calendar
          e inviare messaggi tramite Gmail. Quando un amministratore richiede l’anteprima di una
          risorsa, il sistema può contattare l’indirizzo web indicato per ricavarne i metadati.
        </p>
        <p>
          Il codice dell’applicazione non prevede cookie di profilazione: il cookie rilevato è
          quello strettamente necessario alla sessione autenticata.
        </p>
      </section>

      <section>
        <h2>Informazioni da confermare</h2>
        <p>
          La base giuridica, i tempi di conservazione, gli eventuali riferimenti del DPO, la
          configurazione di hosting e gli eventuali trasferimenti di dati devono essere confermati
          dal Rainerum prima della pubblicazione definitiva; questa versione non li presume.
        </p>
      </section>

      <section>
        <h2>Richieste e contatti</h2>
        <p>
          Le richieste relative ai dati personali vanno rivolte al Rainerum attraverso i suoi
          canali privacy ufficiali, che devono essere confermati dal titolare. Per problemi
          esclusivamente tecnici è disponibile{" "}
          <a href={`mailto:${TECHNICAL_EMAIL}`}>{TECHNICAL_EMAIL}</a>.
        </p>
      </section>
    </article>
  );
}
