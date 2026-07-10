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

export interface AdminConfig {
  masterConnected: boolean;
  masterEmail: string | null;
  mainGroupEmail: string | null;
}

export interface SyncResult {
  added: string[];
  deactivated: string[];
  reactivated: string[];
  calendarsCreated: string[];
  eventsReinjected: number;
  orphansRemoved: number;
  errors: string[];
}
