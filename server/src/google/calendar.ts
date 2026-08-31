import { calendarApi } from "./master.js";
import { withRetry } from "./retry.js";
import type { calendar_v3 } from "googleapis";

export const EXT_PROP_APP = "intercomunica"; // marker: event managed by this app
export const EXT_PROP_EVENT_ID = "intercomunicaEventId";
export const EXT_PROP_SUBGROUPS = "subgroupIds"; // comma-separated
export const EXT_PROP_TAGS = "tags"; // comma-separated tag names

export interface CalendarEventPayload {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  appEventId: string;
  subgroupIds: string[];
  tagNames: string[];
}

export interface ImportedCalendarEvent {
  googleEventId: string;
  occurrenceKey?: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  appEventId?: string;
  tagNames: string[];
}

export interface CalendarChanges {
  items: calendar_v3.Schema$Event[];
  nextSyncToken: string;
}

export function toGoogleEvent(p: CalendarEventPayload) {
  const start = p.allDay
    ? { date: p.startsAt.toISOString().slice(0, 10) }
    : { dateTime: p.startsAt.toISOString() };
  const end = p.allDay
    ? { date: p.endsAt.toISOString().slice(0, 10) }
    : { dateTime: p.endsAt.toISOString() };
  return {
    summary: p.title,
    description: p.description ?? undefined,
    location: p.location ?? undefined,
    start,
    end,
    extendedProperties: {
      private: {
        [EXT_PROP_APP]: "true",
        [EXT_PROP_EVENT_ID]: p.appEventId,
        [EXT_PROP_SUBGROUPS]: p.subgroupIds.join(","),
        [EXT_PROP_TAGS]: p.tagNames.join(","),
      },
    },
  };
}

export function fromGoogleEvent(event: calendar_v3.Schema$Event): ImportedCalendarEvent | null {
  if (event.status === "cancelled" || !event.id) return null;
  const allDay = Boolean(event.start?.date);
  const startValue = event.start?.date ?? event.start?.dateTime;
  const endValue = event.end?.date ?? event.end?.dateTime;
  if (!startValue || !endValue) return null;
  const privateProps = event.extendedProperties?.private;
  const originalStart = event.originalStartTime?.dateTime ?? event.originalStartTime?.date;
  return {
    googleEventId: event.id,
    occurrenceKey:
      event.recurringEventId && originalStart
        ? `${event.recurringEventId}:${originalStart}`
        : undefined,
    title: event.summary?.trim() || "Evento senza titolo",
    description: event.description ?? null,
    location: event.location ?? null,
    startsAt: new Date(allDay ? `${startValue}T00:00:00.000Z` : startValue),
    endsAt: new Date(allDay ? `${endValue}T00:00:00.000Z` : endValue),
    allDay,
    appEventId: privateProps?.[EXT_PROP_EVENT_ID],
    tagNames: (privateProps?.[EXT_PROP_TAGS] ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

/** Create a dedicated calendar in the master account for a teacher and share it read-only. */
export async function createTeacherCalendar(teacherEmail: string, displayName: string): Promise<string> {
  const cal = await calendarApi();
  const created = await withRetry(() =>
    cal.calendars.insert({
      requestBody: {
        summary: displayName,
        description: `Calendario Intercomunica per ${teacherEmail} (gestito automaticamente)`,
        timeZone: "Europe/Rome",
      },
    })
  );
  const calendarId = created.data.id;
  if (!calendarId) throw new Error("Google non ha restituito l'ID del calendario creato");
  await withRetry(() =>
    cal.acl.insert({
      calendarId,
      requestBody: {
        role: "reader",
        scope: { type: "user", value: teacherEmail },
      },
    })
  );
  return calendarId;
}

/** Rename an existing teacher calendar. */
export async function renameCalendar(calendarId: string, summary: string): Promise<void> {
  const cal = await calendarApi();
  await withRetry(() => cal.calendars.patch({ calendarId, requestBody: { summary } }));
}

export async function insertEvent(calendarId: string, payload: CalendarEventPayload): Promise<string> {
  const cal = await calendarApi();
  const res = await withRetry(() =>
    cal.events.insert({ calendarId, requestBody: toGoogleEvent(payload) })
  );
  if (!res.data.id) throw new Error("Google non ha restituito l'ID dell'evento creato");
  return res.data.id;
}

export async function updateEvent(
  calendarId: string,
  googleEventId: string,
  payload: CalendarEventPayload
): Promise<void> {
  const cal = await calendarApi();
  await withRetry(() =>
    cal.events.update({ calendarId, eventId: googleEventId, requestBody: toGoogleEvent(payload) })
  );
}

export async function deleteEvent(calendarId: string, googleEventId: string): Promise<void> {
  const cal = await calendarApi();
  try {
    await withRetry(() => cal.events.delete({ calendarId, eventId: googleEventId }));
  } catch (err: unknown) {
    // already gone → fine (reconciliation-friendly)
    const code = (err as { code?: number }).code;
    if (code !== 404 && code !== 410) throw err;
  }
}

export async function listCalendarChanges(
  calendarId: string,
  options: { syncToken?: string; timeMin?: Date }
): Promise<CalendarChanges> {
  const cal = await calendarApi();
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const res = await withRetry(() =>
      cal.events.list({
        calendarId,
        pageToken,
        syncToken: options.syncToken,
        timeMin: options.syncToken ? undefined : options.timeMin?.toISOString(),
        singleEvents: true,
        showDeleted: true,
        maxResults: 2500,
      })
    );
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
    nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  if (!nextSyncToken) throw new Error("Google non ha restituito il token di sincronizzazione");
  return { items, nextSyncToken };
}

export async function watchCalendar(
  calendarId: string,
  channelId: string,
  channelToken: string,
  address: string
): Promise<{ resourceId: string; expiration: Date }> {
  const cal = await calendarApi();
  const res = await withRetry(() =>
    cal.events.watch({
      calendarId,
      requestBody: { id: channelId, type: "web_hook", address, token: channelToken },
    })
  );
  if (!res.data.resourceId || !res.data.expiration) {
    throw new Error("Google non ha restituito i dati del canale webhook");
  }
  return { resourceId: res.data.resourceId, expiration: new Date(Number(res.data.expiration)) };
}

export async function stopCalendarWatch(channelId: string, resourceId: string): Promise<void> {
  const cal = await calendarApi();
  try {
    await withRetry(() => cal.channels.stop({ requestBody: { id: channelId, resourceId } }));
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 404) throw err;
  }
}

/** List app-managed events currently on a calendar (for reconciliation). */
export async function listAppEvents(calendarId: string): Promise<{ googleEventId: string; appEventId?: string }[]> {
  const cal = await calendarApi();
  const out: { googleEventId: string; appEventId?: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(() =>
      cal.events.list({
        calendarId,
        privateExtendedProperty: [`${EXT_PROP_APP}=true`],
        maxResults: 2500,
        pageToken,
        showDeleted: false,
        singleEvents: false,
      })
    );
    for (const e of res.data.items ?? []) {
      if (e.id) {
        out.push({
          googleEventId: e.id,
          appEventId: e.extendedProperties?.private?.[EXT_PROP_EVENT_ID],
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}
