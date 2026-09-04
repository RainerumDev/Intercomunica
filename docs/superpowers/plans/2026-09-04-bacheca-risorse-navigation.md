# Bacheca, Risorse, and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the event stream from resources, expose every visible future event to the Bacheca, and provide the approved responsive navigation and page-local searches.

**Architecture:** Keep event visibility and category grouping in the server, but remove server-side truncation. Add an authenticated resources endpoint, then let small pure frontend helpers deduplicate, search, filter, partition, and limit events. Move calendar links and shared-resource cards to a dedicated `/risorse` page and make the shared shell responsive.

**Tech Stack:** React 18, React Router 6, TypeScript 5.7, Express 4, Prisma 5, Vitest, Testing Library, CSS/Tailwind 4 utilities.

**Spec:** `docs/superpowers/specs/2026-09-04-bacheca-risorse-rubrica-responsive-design.md`

## Global Constraints

- Bacheca contains events only; resources and calendar links live on `/risorse`.
- Calendar receives no text-search feature.
- The server returns all visible future events grouped by category; visibility rules do not change.
- Bacheca shows all events today and six later events initially; `Mostra altri` adds six.
- Search examines all received future events and removes the six-event presentation limit.
- Resources retain existing `sortOrder` and visibility; no categories, favorites, or popularity ranking are added.
- `Impostazioni` remains admin-only.
- No production deployment is part of this plan.

---

### Task 1: Complete Event Payload and Authenticated Resource Listing

**Files:**
- Modify: `server/src/services/bachecaService.ts`
- Modify: `server/src/services/bachecaService.test.ts`
- Create: `server/src/routes/publicResources.ts`
- Create: `server/src/routes/publicResources.test.ts`
- Modify: `server/src/routes/bacheca.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `BachecaPayload = { eventSections: BachecaSection[] }`.
- Produces: `GET /api/resources` returning `ResourceRecord[]` filtered by `listResourcesForUser(req.user.id)`.
- Preserves: `buildSections(events: SectionInputEvent[]): BachecaSection[]` and category order.

- [ ] **Step 1: Write failing service tests for unbounded category sections**

Add a test that supplies four ordered events with the same tag and asserts all four IDs are returned. Keep the existing `ALTRO`-last and multi-tag tests.

```ts
it("keeps every future event in each category", () => {
  const events = [1, 2, 3, 4].map((index) => event({
    id: `event-${index}`,
    startsAt: new Date(`2026-09-${10 + index}T08:00:00.000Z`),
    tags: [{ tag: { name: "Riunioni", color: "#B8181B" } }],
  }));

  expect(buildSections(events)[0].events.map(({ id }) => id)).toEqual([
    "event-1", "event-2", "event-3", "event-4",
  ]);
});
```

- [ ] **Step 2: Run the focused test and confirm the old limit fails**

Run: `npm test --workspace server -- bachecaService.test.ts`

Expected: FAIL because only three IDs are returned.

- [ ] **Step 3: Remove truncation and resources from the Bacheca aggregate**

Delete `EVENTS_PER_TAG`, push every event into each applicable section, change `BachecaPayload` to the event-only contract, and make `bachecaForUser` return:

```ts
export interface BachecaPayload {
  eventSections: BachecaSection[];
}

export async function bachecaForUser(userId: string): Promise<BachecaPayload> {
  return { eventSections: await eventSectionsForUser(userId) };
}
```

Update the route comment so it no longer promises three events or resources.

- [ ] **Step 4: Write failing route tests for `/api/resources`**

Mock `listResourcesForUser`, authenticate a teacher, and assert the exact current user ID is passed. Add a 401 case.

```ts
const teacherCookie = `${SESSION_COOKIE}=${signSession({
  id: "teacher-1", email: "teacher@example.org", role: "TEACHER",
})}`;
const response = await request(createApp()).get("/api/resources").set("Cookie", teacherCookie);
expect(response).toMatchObject({ status: 200, body: [visibleResource] });
expect(resourceOperations.listResourcesForUser).toHaveBeenCalledWith("teacher-1");
expect((await request(createApp()).get("/api/resources")).status).toBe(401);
```

- [ ] **Step 5: Implement and mount the authenticated resource route**

```ts
export const publicResourcesRouter = Router();
publicResourcesRouter.get("/", requireAuth, h(async (req, res) => {
  res.json(await listResourcesForUser(req.user!.id));
}));
```

Mount it before error handling with `app.use("/api/resources", publicResourcesRouter)`.

- [ ] **Step 6: Run server tests and commit**

Run: `npm test --workspace server -- bachecaService.test.ts publicResources.test.ts`

Expected: PASS.

```bash
git add server/src/services/bachecaService.ts server/src/services/bachecaService.test.ts server/src/routes/bacheca.ts server/src/routes/publicResources.ts server/src/routes/publicResources.test.ts server/src/index.ts
git commit -m "feat: expose complete bacheca events and resources"
```

### Task 2: Pure Bacheca Projection and Filtering

**Files:**
- Create: `web/src/bacheca.ts`
- Create: `web/src/bacheca.test.ts`
- Create: `web/src/search.ts`
- Create: `web/src/search.test.ts`
- Modify: `web/src/types.ts`

**Interfaces:**
- Consumes: `BachecaSection[]` from Task 1.
- Produces: `flattenBachecaEvents(sections): BachecaEvent[]`.
- Produces: `filterBachecaEvents(events, query, category): BachecaEvent[]`.
- Produces: `partitionBachecaEvents(events, now): { today: BachecaEvent[]; upcoming: BachecaEvent[] }`.
- Produces from `web/src/search.ts`: `normalizeSearchText(value: string): string`.

- [ ] **Step 1: Define the event type and failing helper tests**

Move the nested event shape to exported `BachecaEvent` in `types.ts`, and make `BachecaSection.events` use it. Test multi-tag deduplication, chronological sorting, accent-insensitive matching, category combination, an event that is still running today, and the Europe/Rome day boundary.

```ts
expect(flattenBachecaEvents([collegi, riunioni]).map(({ id }) => id)).toEqual([
  "shared-multi-tag", "later-event",
]);
expect(filterBachecaEvents(events, "riunione aula magna", "Collegi"))
  .toEqual([events[0]]);
expect(partitionBachecaEvents(events, new Date("2026-09-04T10:00:00+02:00")).today)
  .toContainEqual(expect.objectContaining({ id: "running-today" }));
```

- [ ] **Step 2: Run the helper tests and confirm missing exports fail**

Run: `npm test --workspace web -- bacheca.test.ts search.test.ts`

Expected: FAIL because `web/src/bacheca.ts` and `web/src/search.ts` do not exist.

- [ ] **Step 3: Implement the pure helpers**

Use a `Map<string, BachecaEvent>` to deduplicate. Merge category names from both the section and event tags, then sort by `startsAt` and `id`. Put accent-insensitive normalization in `search.ts`, using `normalize("NFD")`, removing combining marks, and lowercasing. Partition by the local calendar-day interval: `today` contains events where `startsAt < tomorrowStart && endsAt >= todayStart`, including multi-day events already in progress; `upcoming` contains events with `startsAt >= tomorrowStart`.

```ts
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it").trim();
}

export function filterBachecaEvents(
  events: readonly BachecaEvent[], query: string, category: string | null,
): BachecaEvent[] {
  const words = normalizeSearchText(query).split(/\s+/u).filter(Boolean);
  return events.filter((event) => {
    const categories = event.tags;
    const haystack = normalizeSearchText([
      event.title, event.description ?? "", event.location ?? "", ...categories,
    ].join(" "));
    return (!category || categories.includes(category)) && words.every((word) => haystack.includes(word));
  });
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test --workspace web -- bacheca.test.ts search.test.ts`

Expected: PASS.

```bash
git add web/src/bacheca.ts web/src/bacheca.test.ts web/src/search.ts web/src/search.test.ts web/src/types.ts
git commit -m "feat: add bacheca event projection helpers"
```

### Task 3: Dedicated Resources Page and Responsive Navigation

**Files:**
- Create: `web/src/pages/Risorse.tsx`
- Create: `web/src/pages/Risorse.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/Bacheca.tsx`
- Modify: `web/src/pages/Bacheca.test.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `GET /api/resources`, `GET /api/calendar-links`, and existing rotate endpoint.
- Produces: authenticated `/risorse` route.
- Preserves: independent error states for resources and calendar links.

- [ ] **Step 1: Write failing shell and Risorse page tests**

In `App.test.tsx`, mock `Risorse`, assert four teacher links and five admin links, assert `/risorse` receives `aria-current="page"`, and retain the admin-only settings assertion. In `Risorse.test.tsx`, assert both requests occur, text search filters title/site/hostname without changing order, and one failed request does not hide the successful collection.

```ts
expect(screen.getByRole("link", { name: "Risorse" }).getAttribute("aria-current")).toBe("page");
expect(api.get).toHaveBeenCalledWith("/api/resources");
expect(api.get).toHaveBeenCalledWith("/api/calendar-links");
await user.type(screen.getByRole("searchbox", { name: "Cerca nelle risorse" }), "registro");
expect(screen.getByRole("heading", { name: "Registro elettronico" })).toBeTruthy();
expect(screen.queryByRole("heading", { name: "Vademecum" })).toBeNull();
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test --workspace web -- App.test.tsx Risorse.test.tsx Bacheca.test.tsx`

Expected: FAIL because the route does not exist and Bacheca still owns resources.

- [ ] **Step 3: Implement the new page and route**

`Risorse` loads the two endpoints independently, retains `CalendarResources`, filters resources locally, and renders `ResourceCard` in `sortOrder`. Add to `App.tsx`:

```tsx
<NavLink to="/risorse" className={linkClass}>Risorse</NavLink>
<Route path="/risorse" element={<Risorse />} />
```

Change the label to `Gruppi e docenti`. Render the same destinations in the mobile bottom bar through CSS rather than duplicating route state. Keep `Impostazioni` inside the existing admin condition.

- [ ] **Step 4: Reduce Bacheca to the event payload**

Remove calendar/resource state, imports, requests, and markup. Type its API response as the new event-only `BachecaPayload`. Update tests to assert that `/api/calendar-links` and `/api/resources` are not requested by Bacheca.

- [ ] **Step 5: Add responsive shell and page styling**

Use existing Rainerum tokens. At widths below 768 px, place `.portal-nav` fixed at the bottom, make links equal-width with 44 px minimum targets, add bottom padding to `.portal-main`, show the compact logo, and hide only the email text—not accessible labels. At desktop widths, keep the horizontal header navigation.

```css
@media (max-width: 767px) {
  .portal-nav { position: fixed; inset: auto 0 0; z-index: 30; display: grid; grid-auto-flow: column; }
  .portal-nav__link { min-height: 44px; display: grid; place-items: center; }
  .portal-main { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)); }
}
```

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test --workspace web -- App.test.tsx Risorse.test.tsx Bacheca.test.tsx CalendarResources.test.tsx`

Expected: PASS.

```bash
git add web/src/App.tsx web/src/App.test.tsx web/src/pages/Bacheca.tsx web/src/pages/Bacheca.test.tsx web/src/pages/Risorse.tsx web/src/pages/Risorse.test.tsx web/src/index.css
git commit -m "feat: separate resources from bacheca"
```

### Task 4: Chronological Bacheca UI

**Files:**
- Create: `web/src/components/EventStream.tsx`
- Create: `web/src/components/EventStream.test.tsx`
- Modify: `web/src/pages/Bacheca.tsx`
- Modify: `web/src/pages/Bacheca.test.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: helpers from `web/src/bacheca.ts`.
- Produces: `EventStream({ sections, now? }: { sections: BachecaSection[]; now?: Date })`.
- State: `query`, `category`, and `upcomingLimit`, reset to six when query/category changes.

- [ ] **Step 1: Write failing interaction tests**

Use a fixed `now`. Assert all today events are visible, only six upcoming events appear, a seventh appears after `Mostra altri`, a distant event is found by search, multi-tag events render once, and category plus text search combine.

```tsx
render(<EventStream sections={sections} now={new Date("2026-09-04T09:00:00+02:00")} />);
expect(screen.getAllByTestId("event-row")).toHaveLength(todayCount + 6);
await user.click(screen.getByRole("button", { name: "Mostra altri eventi" }));
expect(screen.getByRole("heading", { name: "Evento numero sette" })).toBeTruthy();
await user.type(screen.getByRole("searchbox", { name: "Cerca negli eventi" }), "dicembre");
expect(screen.getByRole("heading", { name: "Evento distante di dicembre" })).toBeTruthy();
```

- [ ] **Step 2: Run the component test and confirm it fails**

Run: `npm test --workspace web -- EventStream.test.tsx`

Expected: FAIL because `EventStream` is missing.

- [ ] **Step 3: Implement EventStream and event rows**

Render dynamic category buttons from section metadata, use semantic `section` headings for `Oggi` and `Prossimi eventi`, and show date, title, time, location, tag badges, and audience. Search mode passes the full upcoming array; default mode slices `upcomingLimit`.

```ts
const visibleUpcoming = query.trim()
  ? partitioned.upcoming
  : partitioned.upcoming.slice(0, upcomingLimit);
const canExpand = !query.trim() && visibleUpcoming.length < partitioned.upcoming.length;
```

- [ ] **Step 4: Integrate it into Bacheca and match the approved layout**

Keep a centered, single-column stream on desktop and mobile. Use horizontal rows from 768 px upward and stacked rows below it. Add full date and greeting above the stream. Do not render resource or calendar headings.

- [ ] **Step 5: Run frontend tests and commit**

Run: `npm test --workspace web -- EventStream.test.tsx Bacheca.test.tsx App.test.tsx Risorse.test.tsx`

Expected: PASS.

```bash
git add web/src/components/EventStream.tsx web/src/components/EventStream.test.tsx web/src/pages/Bacheca.tsx web/src/pages/Bacheca.test.tsx web/src/index.css
git commit -m "feat: redesign bacheca as chronological stream"
```

### Task 5: Plan-Level Verification

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Verifies all interfaces produced by Tasks 1–4.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test --workspace server
npm test --workspace web
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Run responsive acceptance checks**

At 375, 768, 1024, and 1440 px verify `/`, `/risorse`, `/calendario`, and `/admin/settings` as both teacher and admin. Confirm no horizontal overflow, 44 px mobile navigation targets, correct active route, admin-only settings, complete search results, six-item expansion, and independent Risorse errors.

- [ ] **Step 3: Commit verification fixes if any**

If Step 1 or 2 required a code change, add only those files and commit:

```bash
git commit -m "fix: complete bacheca and resources acceptance"
```

If no files changed, record the four successful commands in the execution summary and do not create an empty commit.
