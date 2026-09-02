import { Link } from "react-router-dom";

export default function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Informazioni legali" className="legal-footer__links">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Termini di servizio</Link>
      </nav>
      <p>Intercomunica · Rainerum</p>
    </footer>
  );
}
