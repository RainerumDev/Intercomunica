import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CalendarResources } from "../components/CalendarResources";
import ResourceCard from "../components/ResourceCard";
import { normalizeSearchText } from "../search";
import type { CalendarLinks, SharedResource } from "../types";

const unavailableCalendarLinks: CalendarLinks = {
  generalGoogleUrl: null,
  personalIcsUrl: null,
  personalWebcalUrl: null,
  personalFeedEligible: false,
  lastFetchedAt: null,
};

function resourceSearchText(resource: SharedResource): string {
  let hostname = "";
  try {
    hostname = new URL(resource.url).hostname;
  } catch {
    hostname = resource.url;
  }
  return normalizeSearchText([
    resource.title,
    resource.description ?? "",
    resource.previewSiteName ?? "",
    hostname,
  ].join(" "));
}

export default function Risorse() {
  const [resources, setResources] = useState<SharedResource[] | null>(null);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [calendarLinks, setCalendarLinks] = useState<CalendarLinks | null>(null);
  const [calendarLinksError, setCalendarLinksError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.get<SharedResource[]>("/api/resources")
      .then(setResources)
      .catch((error: Error) => setResourcesError(error.message));
    api.get<CalendarLinks>("/api/calendar-links")
      .then(setCalendarLinks)
      .catch((error: Error) => setCalendarLinksError(error.message));
  }, []);

  const visibleResources = useMemo(() => {
    const words = normalizeSearchText(query).split(/\s+/u).filter(Boolean);
    return [...(resources ?? [])]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .filter((resource) => {
        const text = resourceSearchText(resource);
        return words.every((word) => text.includes(word));
      });
  }, [query, resources]);

  const rotateCalendarLink = async () => {
    const links = await api.post<CalendarLinks>("/api/calendar-links/rotate");
    setCalendarLinks(links);
    return links;
  };

  return (
    <div className="page">
      <div className="page-heading-group">
        <h1 className="page-heading">Risorse</h1>
        <p className="page-intro">Collegamenti ai calendari e materiali condivisi dalla scuola.</p>
      </div>

      <div className="search-control">
        <label htmlFor="resources-search" className="sr-only">Cerca nelle risorse</label>
        <input
          id="resources-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca nelle risorse"
          className="form-control"
          aria-label="Cerca nelle risorse"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-action">
            Cancella ricerca
          </button>
        )}
      </div>

      <CalendarResources
        links={calendarLinks ?? unavailableCalendarLinks}
        onRotate={rotateCalendarLink}
        statusMessage={
          calendarLinksError
            ? `Impossibile caricare i collegamenti del calendario: ${calendarLinksError}`
            : calendarLinks
              ? undefined
              : "Caricamento collegamenti calendario…"
        }
      />

      <section className="section-block" aria-labelledby="resources-title">
        <h2 id="resources-title" className="section-heading">Risorse condivise</h2>
        {resourcesError ? (
          <p role="alert" className="feedback feedback--error">
            Impossibile caricare le risorse: {resourcesError}
          </p>
        ) : !resources ? (
          <p role="status" aria-live="polite" className="portal-status">Caricamento risorse…</p>
        ) : visibleResources.length === 0 ? (
          <div className="empty-state">
            {query ? "Nessuna risorsa corrisponde alla ricerca." : "Nessuna risorsa condivisa disponibile."}
          </div>
        ) : (
          <div className="card-grid">
            {visibleResources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}
          </div>
        )}
      </section>
    </div>
  );
}
