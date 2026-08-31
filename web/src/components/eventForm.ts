export function commitPendingTag(tagNames: string[], pending: string): string[] {
  const clean = pending.trim().toUpperCase();
  return clean && !tagNames.includes(clean) ? [...tagNames, clean] : tagNames;
}

export function toEventIso(value: string, allDay: boolean): string {
  return allDay
    ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toISOString()
    : new Date(value).toISOString();
}

export function asAllDayValue(value: string): string {
  return value.slice(0, 10);
}

export function asAllDayRange(startsAt: string, endsAt: string) {
  const startDate = asAllDayValue(startsAt);
  let endDate = asAllDayValue(endsAt);
  if (endDate <= startDate) {
    const next = new Date(`${startDate}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    endDate = next.toISOString().slice(0, 10);
  }
  return { startsAt: startDate, endsAt: endDate };
}

export function asTimedValue(value: string, hour: string): string {
  return value.includes("T") ? value : `${value}T${hour}`;
}
