import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Bacheca from "./pages/Bacheca";
import Risorse from "./pages/Risorse";
import Directory from "./pages/Directory";
import Calendario from "./pages/Calendario";
import AdminSettings from "./pages/AdminSettings";
import LegalFooter from "./components/LegalFooter";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const navIconPaths = {
  bacheca: "M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h5",
  risorse: "M3 7V4h7l2 3h9v13H3z",
  calendario: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2",
  directory: "M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M6 21v-3a6 6 0 0 1 12 0v3 M18 4a3 3 0 0 1 0 6 M19 13a4 4 0 0 1 3 4v3 M6 4a3 3 0 0 0 0 6 M5 13a4 4 0 0 0-3 4v3",
  impostazioni: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
};

function NavIcon({ name }: { name: keyof typeof navIconPaths }) {
  return (
    <svg className="portal-nav__icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={navIconPaths[name]} />
    </svg>
  );
}

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
            <NavIcon name="bacheca" />
            <span>Bacheca</span>
          </NavLink>
          <NavLink to="/risorse" className={linkClass}>
            <NavIcon name="risorse" />
            <span>Risorse</span>
          </NavLink>
          <NavLink to="/calendario" className={linkClass}>
            <NavIcon name="calendario" />
            <span>Calendario</span>
          </NavLink>
          <NavLink to="/directory" className={linkClass}>
            <NavIcon name="directory" />
            <span>Gruppi e docenti</span>
          </NavLink>
          {me?.role === "ADMIN" && (
            <NavLink to="/admin/settings" className={linkClass}>
              <NavIcon name="impostazioni" />
              <span>Impostazioni</span>
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
    <div className="portal-shell portal-shell--authenticated">
      <a href="#main-content" className="skip-link">
        Vai al contenuto principale
      </a>
      <Nav />
      <main id="main-content" tabIndex={-1} className="portal-main">
        <Routes>
          <Route path="/" element={<Bacheca />} />
          <Route path="/risorse" element={<Risorse />} />
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
