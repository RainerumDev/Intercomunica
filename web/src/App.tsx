import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Bacheca from "./pages/Bacheca";
import Directory from "./pages/Directory";
import Calendario from "./pages/Calendario";
import AdminSettings from "./pages/AdminSettings";
import LegalFooter from "./components/LegalFooter";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

function Nav() {
  const { me, logout } = useAuth();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `portal-nav__link${isActive ? " portal-nav__link--active" : ""}`;
  return (
    <header className="portal-header">
      <div className="portal-header__inner">
        <div className="portal-brand">
          <span className="portal-brand__picture">
            <img
              src="/rainerum-logo-full.png"
              alt="Rainerum"
              className="portal-brand__logo portal-brand__logo--desktop"
            />
            <img
              src="/rainerum-logo-mark.png"
              alt="Rainerum"
              className="portal-brand__logo portal-brand__logo--mobile"
            />
          </span>
          <span className="portal-brand__service">Intercomunica</span>
        </div>

        <nav className="portal-nav" aria-label="Navigazione principale">
          <NavLink to="/" end className={linkClass}>
            Bacheca
          </NavLink>
          <NavLink to="/directory" className={linkClass}>
            Gruppi & Docenti
          </NavLink>
          <NavLink to="/calendario" className={linkClass}>
            Calendario
          </NavLink>
          {me?.role === "ADMIN" && (
            <NavLink to="/admin/settings" className={linkClass}>
              Impostazioni
            </NavLink>
          )}
        </nav>

        <div className="portal-user">
          <span className="portal-user__email">{me?.email}</span>
          {me?.picture && <img src={me.picture} alt="" className="portal-user__avatar" />}
          <button onClick={logout} className="portal-user__logout">
            Esci
          </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const { me, loading } = useAuth();
  const location = useLocation();
  const normalizedPathname = location.pathname.replace(/\/+$/u, "") || "/";
  const isPublicLegalRoute = normalizedPathname === "/privacy" || normalizedPathname === "/terms";

  if (isPublicLegalRoute) {
    return (
      <div className="portal-shell portal-shell--public">
        <a href="#main-content" className="skip-link">
          Vai al contenuto principale
        </a>
        <main id="main-content" tabIndex={-1} className="legal-main">
          <Routes location={normalizedPathname}>
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
          </Routes>
        </main>
        <LegalFooter />
      </div>
    );
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="portal-status portal-status--screen">
        Caricamento…
      </div>
    );
  }
  if (!me) {
    if (location.pathname !== "/login") return <Navigate to="/login" replace />;
    return (
      <div className="portal-shell portal-shell--login">
        <Login />
        <LegalFooter />
      </div>
    );
  }

  return (
    <div className="portal-shell">
      <a href="#main-content" className="skip-link">
        Vai al contenuto principale
      </a>
      <Nav />
      <main id="main-content" tabIndex={-1} className="portal-main">
        <Routes>
          <Route path="/" element={<Bacheca />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/calendario" element={<Calendario />} />
          {me.role === "ADMIN" && (
            <>
              <Route path="/admin/settings" element={<AdminSettings />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <LegalFooter />
    </div>
  );
}
