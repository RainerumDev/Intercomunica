import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
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
    <div className="event-card surface-card surface-card--interactive">
      <div className="flex items-start justify-between gap-2">
        <h3 className="resource-card__title">{e.title}</h3>
        {e.isGlobal && (
          <span className="badge badge--global">Per tutti</span>
        )}
      </div>
      <p className="event-card__date">
        {e.allDay ? dayFmt.format(start) : dateFmt.format(start)}
      </p>
      {e.location && <p className="event-card__meta mt-1">📍 {e.location}</p>}
      {e.description && (
        <p className="event-card__description mt-2 line-clamp-3">{e.description}</p>
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

  return (
    <div className="page">
      <div className="page-heading-group">
        <h1 className="page-heading">
          Ciao{me?.name ? `, ${me.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="page-intro">
          I tuoi prossimi impegni, organizzati per categoria.
        </p>
      </div>

      {error ? (
        <p role="alert" className="feedback feedback--error">{error}</p>
      ) : !payload ? (
        <p role="status" aria-live="polite" className="portal-status">Caricamento bacheca…</p>
      ) : (
        <>
          <section className="section-block">
            <h2 className="section-heading">Prossimi eventi</h2>
            {payload.eventSections.length === 0 && (
              <div className="empty-state">
                Nessun impegno in programma. Goditi la calma! 🌿
              </div>
            )}

            <div className="space-y-8">
              {payload.eventSections.map((s) => (
                <section key={s.tag}>
                  <h3 className="section-heading flex items-center gap-2 mb-3">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: s.color ?? "#1d4ed8" }}
                    />
                    {s.tag}
                  </h3>
                  <div className="card-grid">
                    {s.events.map((e) => (
                      <EventCard key={`${s.tag}-${e.id}`} e={e} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
