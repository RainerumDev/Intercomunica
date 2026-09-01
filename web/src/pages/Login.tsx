import { useSearchParams } from "react-router-dom";

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get("error");
  return (
    <div className="min-h-screen grid place-items-center bg-gray-100">
      <div className="bg-white rounded-xl shadow p-10 w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-blue-900">Intercomunica</h1>
        <p className="text-gray-500 mt-1 mb-8">Rainerum — comunicazione interna docenti</p>
        {error && (
          <p className="mb-4 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">
            {error === "domain"
              ? "Accesso consentito solo con l'account istituzionale della scuola."
              : error === "group"
                ? "Account non appartenente al gruppo autorizzato."
              : "Accesso non riuscito. Riprova."}
          </p>
        )}
        <a
          href="/api/auth/google"
          className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-blue-700 px-4 py-3 text-white font-medium hover:bg-blue-800"
        >
          Accedi con Google
        </a>
        <p className="text-xs text-gray-400 mt-6">
          Usa il tuo account istituzionale @rainerum.it
        </p>
      </div>
    </div>
  );
}
