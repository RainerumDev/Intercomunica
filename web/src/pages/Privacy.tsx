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
        <p className="legal-document__eyebrow">Bozza 1.0 · aggiornata al 2 settembre 2026</p>
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
