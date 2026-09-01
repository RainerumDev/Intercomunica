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
  hasCalendar: boolean;
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
    bachecaOnly: boolean;
    tags: string[];
  }[];
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
