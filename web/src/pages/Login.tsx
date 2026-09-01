import { useSearchParams } from "react-router-dom";

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get("error");
  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand__picture">
            <img
              src="/rainerum-logo-full.png"
              alt="Rainerum"
              className="login-brand__logo login-brand__logo--desktop"
            />
            <img
              src="/rainerum-logo-mark.png"
              alt="Rainerum"
              className="login-brand__logo login-brand__logo--mobile"
            />
          </span>
          <div>
            <h1 className="login-brand__service">Intercomunica</h1>
            <p className="login-card__intro">Comunicazione interna docenti</p>
          </div>
        </div>
        {error && (
          <p role="alert" className="feedback feedback--error mb-4">
            {error === "domain"
              ? "Accesso consentito solo con l'account istituzionale della scuola."
              : "Accesso non riuscito. Riprova."}
          </p>
        )}
        <a
          href="/api/auth/google"
          className="button button--primary button--wide"
        >
          Accedi con Google
        </a>
        <p className="login-card__footnote">
          Usa il tuo account istituzionale @rainerum.it
        </p>
      </div>
    </main>
  );
}
