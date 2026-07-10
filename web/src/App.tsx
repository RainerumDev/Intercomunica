import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Bacheca from "./pages/Bacheca";
import Directory from "./pages/Directory";
import Calendario from "./pages/Calendario";
import AdminSettings from "./pages/AdminSettings";

function Nav() {
  const { me, logout } = useAuth();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      isActive ? "bg-blue-800 text-white" : "text-blue-100 hover:bg-blue-700"
    }`;
  return (
    <nav className="bg-blue-900">
      <div className="mx-auto max-w-7xl px-4 flex h-14 items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-white font-semibold">Intercomunica</span>
          <div className="flex gap-1">
            <NavLink to="/" end className={linkClass}>
              Bacheca
            </NavLink>
            <NavLink to="/directory" className={linkClass}>
              Gruppi & Docenti
            </NavLink>
            {me?.role === "ADMIN" && (
              <>
                <NavLink to="/calendario" className={linkClass}>
                  Calendario
                </NavLink>
                <NavLink to="/admin/settings" className={linkClass}>
                  Impostazioni
                </NavLink>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-blue-200 text-sm hidden sm:block">{me?.email}</span>
          {me?.picture && <img src={me.picture} alt="" className="h-8 w-8 rounded-full" />}
          <button
            onClick={logout}
            className="text-blue-100 hover:text-white text-sm underline underline-offset-2"
          >
            Esci
          </button>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-500">Caricamento…</div>
    );
  }
  if (!me) {
    if (location.pathname !== "/login") return <Navigate to="/login" replace />;
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Bacheca />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/directory" element={<Directory />} />
          {me.role === "ADMIN" && (
            <>
              <Route path="/calendario" element={<Calendario />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
