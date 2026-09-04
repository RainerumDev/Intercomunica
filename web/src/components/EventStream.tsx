import { useMemo, useState } from "react";
import {
  filterBachecaEvents,
  flattenBachecaEvents,
  partitionBachecaEvents,
} from "../bacheca";
import type { BachecaEvent, BachecaSection } from "../types";

const UPCOMING_STEP = 6;

const eventDateFormat = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "long",
});
const eventTimeFormat = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
});

interface EventRowProps {
  event: BachecaEvent;
  colors: ReadonlyMap<string, string | null>;
}

function EventRow({ event, colors }: EventRowProps) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const schedule = event.allDay
    ? "Tutto il giorno"
    : `${eventTimeFormat.format(start)}–${eventTimeFormat.format(end)}`;

  return (
    <article className="event-row surface-card" data-testid="event-row">
      <time className="event-row__date" dateTime={event.startsAt}>
        {eventDateFormat.format(start)}
      </time>
      <div className="event-row__content">
        <h3 className="event-row__title">{event.title}</h3>
        <p className="event-row__details">
          <time dateTime={event.startsAt}>{schedule}</time>
          {event.location && <span> · {event.location}</span>}
        </p>
        <div className="event-row__meta">
          <div className="event-row__tags" aria-label="Categorie">
            {event.tags.map((tag) => (
              <span
                key={tag}
                className="event-tag"
                style={{ borderColor: colors.get(tag) ?? "var(--line-strong)" }}
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="event-row__audience">
            {event.isGlobal ? "Per tutti" : "Per i gruppi coinvolti"}
          </span>
        </div>
      </div>
    </article>
  );
}

export function EventStream({ sections, now }: { sections: BachecaSection[]; now?: Date }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [upcomingLimit, setUpcomingLimit] = useState(UPCOMING_STEP);
  const [renderedAt] = useState(() => now ?? new Date());

  const categoryColors = useMemo(
    () => new Map(sections.map((section) => [section.tag, section.color])),
    [sections],
  );
  const categories = useMemo(
    () => sections.filter((section) => section.events.length > 0),
    [sections],
  );
  const partitioned = useMemo(() => {
    const events = filterBachecaEvents(flattenBachecaEvents(sections), query, category);
    return partitionBachecaEvents(events, now ?? renderedAt);
  }, [category, now, query, renderedAt, sections]);

  const isSearching = Boolean(query.trim());
  const visibleUpcoming = isSearching
    ? partitioned.upcoming
    : partitioned.upcoming.slice(0, upcomingLimit);
  const canExpand = !isSearching && visibleUpcoming.length < partitioned.upcoming.length;
  const hasEvents = partitioned.today.length > 0 || visibleUpcoming.length > 0;

  const changeQuery = (value: string) => {
    setQuery(value);
    setUpcomingLimit(UPCOMING_STEP);
  };
  const changeCategory = (value: string | null) => {
    setCategory(value);
    setUpcomingLimit(UPCOMING_STEP);
  };

  return (
    <div className="event-stream">
      <div className="event-stream__controls">
        <div className="search-control">
          <label htmlFor="event-search" className="sr-only">Cerca negli eventi</label>
          <input
            id="event-search"
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Cerca negli eventi"
            className="form-control"
            aria-label="Cerca negli eventi"
          />
          {query && (
            <button type="button" onClick={() => changeQuery("")} className="text-action">
              Cancella ricerca
            </button>
          )}
        </div>

        <div className="event-stream__filters" aria-label="Filtra per categoria">
          <button
            type="button"
            className="event-filter"
            aria-pressed={category === null}
            onClick={() => changeCategory(null)}
          >
            Tutti
          </button>
          {categories.map((section) => (
            <button
              key={section.tag}
              type="button"
              className="event-filter"
              aria-pressed={category === section.tag}
              onClick={() => changeCategory(section.tag)}
            >
              <span
                className="event-filter__dot"
                aria-hidden="true"
                style={{ backgroundColor: section.color ?? "var(--line-strong)" }}
              />
              {section.tag}
            </button>
          ))}
        </div>
      </div>

      {!hasEvents ? (
        <div className="empty-state">
          {isSearching || category
            ? "Nessun evento corrisponde alla ricerca."
            : "Nessun impegno in programma. Goditi la calma!"}
        </div>
      ) : (
        <div className="event-stream__sections">
          {partitioned.today.length > 0 && (
            <section className="event-stream__section" aria-labelledby="today-events-title">
              <h2 id="today-events-title" className="section-heading">Oggi</h2>
              <div className="event-stream__rows">
                {partitioned.today.map((event) => <EventRow key={event.id} event={event} colors={categoryColors} />)}
              </div>
            </section>
          )}

          {visibleUpcoming.length > 0 && (
            <section className="event-stream__section" aria-labelledby="upcoming-events-title">
              <h2 id="upcoming-events-title" className="section-heading">Prossimi eventi</h2>
              <div className="event-stream__rows">
                {visibleUpcoming.map((event) => <EventRow key={event.id} event={event} colors={categoryColors} />)}
              </div>
              {canExpand && (
                <button
                  type="button"
                  className="button button--secondary event-stream__more"
                  onClick={() => setUpcomingLimit((limit) => limit + UPCOMING_STEP)}
                >
                  Mostra altri eventi
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
