import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import ResourceCard from "../components/ResourceCard";
import type { BachecaPayload, BachecaSection } from "../types";

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });

function EventCard({ e }: { e: BachecaSection["events"][number] }) {
  const start = new Date(e.startsAt);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900">{e.title}</h3>
        {e.isGlobal && (
          <span className="shrink-0 rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-0.5">
            Per tutti
          </span>
        )}
      </div>
      <p className="text-sm text-blue-700 mt-1">
        {e.allDay ? dayFmt.format(start) : dateFmt.format(start)}
      </p>
      {e.location && <p className="text-sm text-gray-500 mt-1">📍 {e.location}</p>}
      {e.description && (
        <p className="text-sm text-gray-600 mt-2 line-clamp-3">{e.description}</p>
      )}
    </div>
  );
}

export default function Bacheca() {
  const { me } = useAuth();
  const [payload, setPayload] = useState<BachecaPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BachecaPayload>("/api/bacheca")
      .then(setPayload)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!payload) return <p role="status" aria-live="polite" className="text-gray-500">Caricamento bacheca…</p>;

  const { resources, eventSections } = payload;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        Ciao{me?.name ? `, ${me.name.split(" ")[0]}` : ""} 👋
      </h1>
      <p className="text-gray-500 mb-6">
        Le risorse condivise e i tuoi prossimi impegni, organizzati per categoria.
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Risorse condivise</h2>
        {resources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
            Nessuna risorsa condivisa disponibile.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Prossimi eventi</h2>
        {eventSections.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
            Nessun impegno in programma. Goditi la calma! 🌿
          </div>
        )}

        <div className="space-y-8">
          {eventSections.map((s) => (
            <section key={s.tag}>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-3">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: s.color ?? "#1d4ed8" }}
                />
                {s.tag}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {s.events.map((e) => (
                  <EventCard key={`${s.tag}-${e.id}`} e={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
