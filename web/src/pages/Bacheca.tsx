import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { CalendarResources } from "../components/CalendarResources";
import type { BachecaSection, CalendarLinks } from "../types";

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
  const [sections, setSections] = useState<BachecaSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarLinks, setCalendarLinks] = useState<CalendarLinks | null>(null);
  const [calendarLinksError, setCalendarLinksError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BachecaSection[]>("/api/bacheca")
      .then(setSections)
      .catch((e: Error) => setError(e.message));

    api
      .get<CalendarLinks>("/api/calendar-links")
      .then(setCalendarLinks)
      .catch((e: Error) => setCalendarLinksError(e.message));
  }, []);

  const rotateCalendarLink = async () => {
    const links = await api.post<CalendarLinks>("/api/calendar-links/rotate");
    setCalendarLinks(links);
    return links;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        Ciao{me?.name ? `, ${me.name.split(" ")[0]}` : ""} 👋
      </h1>
      <p className="text-gray-500 mb-6">I tuoi prossimi impegni, organizzati per categoria.</p>

      {calendarLinksError ? (
        <section aria-labelledby="calendar-resources-title" className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 id="calendar-resources-title" className="font-semibold text-red-800">Calendari</h2>
          <p className="mt-1 text-sm text-red-700">Impossibile caricare i collegamenti del calendario: {calendarLinksError}</p>
        </section>
      ) : calendarLinks ? (
        <CalendarResources links={calendarLinks} onRotate={rotateCalendarLink} />
      ) : (
        <section aria-labelledby="calendar-resources-title" className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
          <h2 id="calendar-resources-title" className="font-semibold text-gray-800">Calendari</h2>
          <p className="mt-1 text-sm text-gray-500">Caricamento collegamenti calendario…</p>
        </section>
      )}

      {error ? (
        <p className="text-red-600">{error}</p>
      ) : !sections ? (
        <p className="text-gray-500">Caricamento bacheca…</p>
      ) : sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          Nessun impegno in programma. Goditi la calma! 🌿
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.tag}>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-3">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: s.color ?? "#1d4ed8" }}
                />
                {s.tag}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {s.events.map((e) => (
                  <EventCard key={`${s.tag}-${e.id}`} e={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
