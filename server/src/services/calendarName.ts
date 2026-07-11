export const DEFAULT_CALENDAR_TEMPLATE = "Calendario Rainerum - {nome}";
export const NAME_PLACEHOLDER = "{nome}";

/**
 * Render a teacher calendar name from the configured template.
 * Placeholders: {nome} → teacher display name (falls back to email), {email}.
 */
export function renderCalendarName(
  template: string | null | undefined,
  teacher: { name?: string | null; email: string }
): string {
  const tpl = template?.trim() || DEFAULT_CALENDAR_TEMPLATE;
  const display = teacher.name?.trim() || teacher.email;
  return tpl.replaceAll(NAME_PLACEHOLDER, display).replaceAll("{email}", teacher.email).trim();
}
