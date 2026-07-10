import { directoryApi } from "./master.js";

export interface GroupMember {
  email: string;
  name?: string;
}

/** List all groups of the domain (paginated). */
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

/** List all (direct + nested-flattened) human members of a group. */
export async function listGroupMembers(groupEmail: string): Promise<GroupMember[]> {
  const admin = await directoryApi();
  const members: GroupMember[] = [];
  let pageToken: string | undefined;
  do {
    const res = await admin.members.list({
      groupKey: groupEmail,
      includeDerivedMembership: true,
      maxResults: 200,
      pageToken,
    });
    for (const m of res.data.members ?? []) {
      if (m.type === "USER" && m.email && m.status !== "SUSPENDED") {
        members.push({ email: m.email.toLowerCase() });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  // dedupe (nested groups can repeat members)
  const seen = new Set<string>();
  return members.filter((m) => (seen.has(m.email) ? false : (seen.add(m.email), true)));
}
