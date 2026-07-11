import { directoryApi, cloudIdentityApi } from "./master.js";

export interface GroupMember {
  email: string;
  name?: string;
}

/**
 * List all groups of the domain (paginated).
 * NOTE: requires a delegated admin role on the master account (Admin SDK).
 * Without it Google returns 403 → mapped to DIRECTORY_FORBIDDEN; the UI
 * falls back to manual group-email entry.
 */
export async function listGroups(): Promise<{ email: string; name?: string }[]> {
  const admin = await directoryApi();
  const groups: { email: string; name?: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await admin.groups.list({ customer: "my_customer", maxResults: 200, pageToken });
    for (const g of res.data.groups ?? []) {
      if (g.email) groups.push({ email: g.email.toLowerCase(), name: g.name ?? undefined });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return groups;
}

export interface RawMembership {
  type?: string | null;
  preferredMemberKey?: { id?: string | null } | null;
}

/** Keep human members only (skip nested groups/service accounts), dedupe, lowercase. */
export function extractMemberEmails(memberships: RawMembership[]): GroupMember[] {
  const seen = new Set<string>();
  const out: GroupMember[] = [];
  for (const m of memberships) {
    // `type` may be omitted depending on view; only skip when explicitly non-human
    if (m.type && m.type !== "USER") continue;
    const email = m.preferredMemberKey?.id?.toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push({ email });
  }
  return out;
}

/** Resolve a group email to its Cloud Identity resource name (groups/{id}). */
async function lookupGroupName(groupEmail: string): Promise<string> {
  const ci = await cloudIdentityApi();
  const res = await ci.groups.lookup({ "groupKey.id": groupEmail });
  const name = res.data.name;
  if (!name) throw new Error(`Gruppo non trovato: ${groupEmail}`);
  return name;
}

/**
 * List the members of a group via the Cloud Identity API.
 * Works WITHOUT admin privileges: the master account only needs visibility on
 * the group's member list (Groups setting "Chi può visualizzare i membri").
 * Returns direct members; nested groups are skipped.
 */
export async function listGroupMembers(groupEmail: string): Promise<GroupMember[]> {
  const ci = await cloudIdentityApi();
  const parent = await lookupGroupName(groupEmail);
  const memberships: RawMembership[] = [];
  let pageToken: string | undefined;
  do {
    const res = await ci.groups.memberships.list({ parent, pageSize: 500, pageToken });
    memberships.push(...(res.data.memberships ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return extractMemberEmails(memberships);
}
