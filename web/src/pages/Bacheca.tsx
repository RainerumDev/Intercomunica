import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { EventStream } from "../components/EventStream";
import type { BachecaPayload } from "../types";

const fullDateFormat = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

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
    <div className="page page--bacheca">
      <div className="page-heading-group">
        <p className="page-heading-group__date">{fullDateFormat.format(new Date())}</p>
        <h1 className="page-heading">Ciao{me?.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
        <p className="page-intro">
          I tuoi impegni, in ordine cronologico.
        </p>
      </div>

      {error ? (
        <p role="alert" className="feedback feedback--error">{error}</p>
      ) : !payload ? (
        <p role="status" aria-live="polite" className="portal-status">Caricamento bacheca…</p>
      ) : (
        <EventStream sections={payload.eventSections} />
      )}
    </div>
  );
}
