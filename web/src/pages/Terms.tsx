import { Link } from "react-router-dom";

const TECHNICAL_EMAIL = "intercomunica.rainerum@delugan.net";

export default function Terms() {
  return (
    <article className="legal-document">
      <header className="legal-document__header">
        <Link to="/" aria-label="Intercomunica Rainerum" className="legal-brand">
          <img src="/rainerum-logo-full.png" alt="" aria-hidden="true" />
          <span>Intercomunica</span>
        </Link>
        <p className="legal-document__eyebrow">Bozza 1.0 · aggiornata al 2 settembre 2026</p>
        <h1>Termini di servizio di Intercomunica</h1>
      </header>

      <section>
        <h2>Gestione del servizio</h2>
        <p>
          <strong>Rainerum è il cliente</strong> e, per i dati personali, il titolare del
          trattamento;{" "}
          <strong>Kevin Delugan Dev ne cura la fornitura tecnica</strong>. Contenuti, anagrafiche,
          autorizzazioni e decisioni operative restano sotto la responsabilità del Rainerum.
        </p>
      </section>

      <section>
        <h2>Finalità e accesso</h2>
        <p>
          Intercomunica supporta le comunicazioni interne, la directory dei docenti, i sottogruppi,
          la bacheca, gli eventi, il calendario e le risorse condivise. L’accesso è riservato agli
          account istituzionali autorizzati dal Rainerum; le funzioni amministrative sono limitate
          agli utenti con il relativo ruolo.
        </p>
      </section>

      <section>
        <h2>Uso corretto</h2>
        <p>
          Sono vietati l’accesso non autorizzato, la condivisione delle credenziali, i tentativi di
          alterazione o elusione dei controlli, l’estrazione massiva e l’uso di dati o comunicazioni
          per finalità estranee all’attività scolastica autorizzata.
        </p>
      </section>

      <section>
        <h2>Contenuti e integrazioni</h2>
        <p>
          Il Rainerum cura correttezza, aggiornamento e destinatari di eventi, gruppi, comunicazioni
          e risorse. Le funzioni collegate a Google OAuth, Groups o Directory, Calendar e Gmail
          dipendono dalla configurazione e dalla disponibilità dei relativi servizi.
        </p>
        <p>
          Le risorse possono collegare siti esterni: l’anteprima è informativa e non sostituisce la
          verifica del contenuto e della destinazione da parte dell’utente.
        </p>
      </section>

      <section>
        <h2>Contatti e condizioni da confermare</h2>
        <p>
          Per problemi tecnici: <a href={`mailto:${TECHNICAL_EMAIL}`}>{TECHNICAL_EMAIL}</a>. Le
          segnalazioni sui contenuti e sulle autorizzazioni vanno indirizzate al Rainerum attraverso
          i canali indicati dall’ente.
        </p>
        <p>
          Restano applicabili le policy e i regolamenti del Rainerum. Legge applicabile e autorità
          territorialmente competente saranno indicate soltanto dopo la validazione dell’ente.
        </p>
      </section>
    </article>
  );
}
