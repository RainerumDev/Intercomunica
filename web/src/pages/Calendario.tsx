import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import itLocale from "@fullcalendar/core/locales/it";
import type { EventClickArg, EventInput } from "@fullcalendar/core";
import { api } from "../api";
import type { AppEvent, Subgroup, Tag } from "../types";
import EventModal, { type EventDraft } from "../components/EventModal";

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Calendario() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calendarRef = useRef<FullCalendar | null>(null);

  const reload = useCallback(async () => {
    const [e, s, t] = await Promise.all([
      api.get<AppEvent[]>("/api/events?from=2000-01-01&to=2100-01-01"),
      api.get<Subgroup[]>("/api/subgroups"),
      api.get<Tag[]>("/api/tags"),
    ]);
    setEvents(e);
    setSubgroups(s);
    setTags(t);
  }, []);

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
  }, [reload]);

  const fcEvents: EventInput[] = events.map((e) => ({
    id: e.id,
    title: e.isGlobal ? `🌍 ${e.title}` : e.title,
    start: e.startsAt,
    end: e.endsAt,
    allDay: e.allDay,
    backgroundColor: e.isGlobal ? "#b45309" : "#1d4ed8",
    borderColor: e.isGlobal ? "#b45309" : "#1d4ed8",
  }));

  const onDateClick = (arg: DateClickArg) => {
    const start = arg.date;
    const end = new Date(start.getTime() + 3600e3);
    setDraft({
      title: "",
      description: "",
      location: "",
      startsAt: toLocalInput(start),
      endsAt: toLocalInput(end),
      allDay: arg.allDay,
      isGlobal: false,
      subgroupIds: [],
      tagNames: [],
    });
  };

  const onEventClick = (arg: EventClickArg) => {
    const e = events.find((x) => x.id === arg.event.id);
    if (!e) return;
    setDraft({
      id: e.id,
      title: e.title,
      description: e.description ?? "",
      location: e.location ?? "",
      startsAt: toLocalInput(new Date(e.startsAt)),
      endsAt: toLocalInput(new Date(e.endsAt)),
      allDay: e.allDay,
      isGlobal: e.isGlobal,
      subgroupIds: e.subgroupIds,
      tagNames: e.tags.map((t) => t.name),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Calendario</h1>
        <button
          onClick={() =>
            onDateClick({
              date: new Date(),
              allDay: false,
            } as DateClickArg)
          }
          className="rounded-md bg-blue-700 px-4 py-2 text-white text-sm font-medium hover:bg-blue-800"
        >
          + Nuovo evento
        </button>
      </div>
      {error && <p className="mb-3 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}

      <div className="rounded-lg bg-white border border-gray-200 p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth",
          }}
          locale={itLocale}
          height="auto"
          events={fcEvents}
          dateClick={onDateClick}
          eventClick={onEventClick}
          nowIndicator
          firstDay={1}
        />
      </div>

      {draft && (
        <EventModal
          draft={draft}
          subgroups={subgroups}
          knownTags={tags}
          onSaved={() => {
            setDraft(null);
            reload();
          }}
          onDeleted={() => {
            setDraft(null);
            reload();
          }}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}
