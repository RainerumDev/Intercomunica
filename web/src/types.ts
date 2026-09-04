import type { SubgroupRef } from "./subgroups";

export interface Me {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: "ADMIN" | "TEACHER";
  subgroups: SubgroupRef[];
}

export interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "TEACHER";
  subgroups: SubgroupRef[];
}

export interface Subgroup extends SubgroupRef {
  description: string | null;
  color: string | null;
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
  hasGeneralCalendarEvent: boolean;
  tags: Tag[];
  subgroupIds: string[];
}

export interface EventCalendarCapabilities {
  generalCalendarConfigured: boolean;
  generalCalendarWritable: boolean;
}

export interface BachecaEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  isGlobal: boolean;
  tags: string[];
}

export interface BachecaSection {
  tag: string;
  color: string | null;
  events: BachecaEvent[];
}

export interface SharedResource {
  id: string;
  url: string;
  title: string;
  description: string | null;
  previewEnabled: boolean;
  previewImageUrl: string | null;
  hasPreviewImage: boolean;
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
  "id" | "previewFetchedAt" | "sortOrder" | "createdAt" | "updatedAt" | "hasPreviewImage"
>;

export interface BachecaPayload {
  eventSections: BachecaSection[];
}

export interface AdminConfig {
  masterConnected: boolean;
  masterEmail: string | null;
  mainGroupEmail: string | null;
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

export interface CalendarLinks {
  generalGoogleUrl: string | null;
  personalIcsUrl: string | null;
  personalWebcalUrl: string | null;
  personalFeedEligible: boolean;
  lastFetchedAt: string | null;
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
  calendarsRemoved: string[];
  calendarsPending: string[];
  errors: string[];
}
