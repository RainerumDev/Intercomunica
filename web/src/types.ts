export interface Me {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: "ADMIN" | "TEACHER";
  subgroups: { id: string; name: string }[];
}

export interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "TEACHER";
  hasCalendar: boolean;
  subgroups: { id: string; name: string }[];
}

export interface Subgroup {
  id: string;
  name: string;
  description: string | null;
  folder?: string | null;
  members: { id: string; email: string; name: string | null }[];
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface AppEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  isGlobal: boolean;
  bachecaOnly: boolean;
  tags: Tag[];
  subgroupIds: string[];
  instanceCount?: number;
}

export interface BachecaSection {
  tag: string;
  color: string | null;
  events: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    isGlobal: boolean;
    tags: string[];
  }[];
}

export interface SharedResource {
  id: string;
  url: string;
  title: string;
  description: string | null;
  previewEnabled: boolean;
  previewImageUrl: string | null;
  previewSiteName: string | null;
  previewFetchedAt: string | null;
  isGlobal: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  subgroupIds: string[];
}

export type SharedResourceDraft = Omit<
  SharedResource,
  "id" | "previewFetchedAt" | "sortOrder" | "createdAt" | "updatedAt"
>;

export interface BachecaPayload {
  resources: SharedResource[];
  eventSections: BachecaSection[];
}

export interface AdminConfig {
  masterConnected: boolean;
  masterEmail: string | null;
  mainGroupEmail: string | null;
  calendarNameTemplate: string;
  generalCalendarId: string | null;
  generalCalendarLastSyncAt: string | null;
  generalCalendarLastError: string | null;
  generalCalendarWatchExpiresAt: string | null;
}

export interface GeneralCalendarSyncResult {
  imported: number;
  updated: number;
  deleted: number;
}

export interface SyncLogEntry {
  id: string;
  type: string;
  status: "RUNNING" | "SUCCESS" | "ERROR";
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SyncResult {
  added: string[];
  deactivated: string[];
  reactivated: string[];
  calendarsCreated: string[];
  calendarsRenamed: string[];
  eventsReinjected: number;
  orphansRemoved: number;
  errors: string[];
}
