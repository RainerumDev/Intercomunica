# Responsive Teacher and Group Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the combined subgroup cards and teacher tables with the approved searchable, responsive Rubrica master–detail experience.

**Architecture:** Keep `/api/users` and `/api/subgroups` unchanged and derive display groups through pure helpers. `Directory` owns loading, active tab, search, selection, and existing admin mutations; focused list/detail components render teachers and groups. Desktop shows both panes, while mobile switches between list and detail without losing query or scroll position.

**Tech Stack:** React 18, React Router 6, TypeScript 5.7, Vitest, Testing Library, existing Express subgroup/user APIs, CSS/Tailwind 4 utilities.

**Spec:** `docs/superpowers/specs/2026-09-04-bacheca-risorse-rubrica-responsive-design.md`

**Prerequisite:** Complete `docs/superpowers/plans/2026-09-04-bacheca-risorse-navigation.md` first; this plan reuses its responsive shell and shared `normalizeSearchText` helper.

## Global Constraints

- The route remains `/directory` and persists the active tab as `tab=teachers|groups`.
- Search is local and specific to the active tab.
- Mobile has no horizontally scrolling teacher table.
- Desktop uses a left list and right detail; the detail begins beside the tab selector.
- Group member lists are complete and never collapsed.
- `Invia email al gruppo` is the final content action after all members.
- Technical group fields appear only inside the admin editor.
- Existing authorization and API mutation behavior remain unchanged.
- No generic `Gestisci` action is added.
- No production deployment is part of this plan.

---

### Task 1: Directory View-Model Helpers

**Files:**
- Create: `web/src/directory.ts`
- Create: `web/src/directory.test.ts`
- Modify: `web/src/subgroups.ts`
- Modify: `web/src/subgroups.test.ts`

**Interfaces:**
- Produces: `DirectoryTab = "teachers" | "groups"`.
- Produces: `TeacherScope = "all" | "middle" | "upper" | "mine"`.
- Produces: `parseDirectoryTab(value: string | null): DirectoryTab`.
- Produces: `filterTeachers(members, query, scope, currentUser): Member[]`.
- Produces: `groupTeachersAlphabetically(members): Array<{ letter: string; members: Member[] }>`.
- Reuses: `sortMembers`, `sortSubgroups`, and `buildDirectorySections` from `subgroups.ts`.

- [ ] **Step 1: Write failing helper tests**

Cover invalid tab fallback, accent-insensitive name/email/group search, all four scopes, deterministic alphabetical grouping, unnamed users under `#`, and no mutation of inputs.

```ts
expect(parseDirectoryTab("groups")).toBe("groups");
expect(parseDirectoryTab("invalid")).toBe("teachers");
expect(filterTeachers(members, "rossetti 1a", "middle", me).map(({ id }) => id))
  .toEqual(["teacher-middle"]);
expect(groupTeachersAlphabetically(members).map(({ letter }) => letter))
  .toEqual(["A", "B", "#"]);
```

Define middle/upper classification from normalized subgroup folder/name values in one pure function. `mine` means at least one subgroup ID is shared with `currentUser.subgroups`.

- [ ] **Step 2: Run tests and confirm missing helpers fail**

Run: `npm test --workspace web -- directory.test.ts subgroups.test.ts`

Expected: FAIL because `directory.ts` does not exist.

- [ ] **Step 3: Implement normalization, filtering, and grouping**

```ts
export function parseDirectoryTab(value: string | null): DirectoryTab {
  return value === "groups" ? "groups" : "teachers";
}

export function groupTeachersAlphabetically(members: readonly Member[]): TeacherLetterGroup[] {
  const groups = new Map<string, Member[]>();
  for (const member of sortMembers(members)) {
    const first = normalizeSearchText(member.name ?? "").charAt(0).toLocaleUpperCase("it");
    const letter = /^[A-Z]$/u.test(first) ? first : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), member]);
  }
  return [...groups].map(([letter, values]) => ({ letter, members: values }));
}
```

Import the shared accent-insensitive `normalizeSearchText` from `web/src/search.ts`, produced by the Bacheca plan, rather than duplicating it.

- [ ] **Step 4: Run tests and commit**

Run: `npm test --workspace web -- directory.test.ts subgroups.test.ts`

Expected: PASS.

```bash
git add web/src/directory.ts web/src/directory.test.ts web/src/subgroups.ts web/src/subgroups.test.ts
git commit -m "feat: add directory view model helpers"
```

### Task 2: Rubrica Shell, Tabs, and Responsive Pane State

**Files:**
- Modify: `web/src/pages/Directory.tsx`
- Modify: `web/src/pages/Directory.test.tsx`
- Create: `web/src/components/DirectoryTabs.tsx`
- Create: `web/src/components/DirectoryTabs.test.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `DirectoryTab` and `parseDirectoryTab` from Task 1.
- Produces: `DirectoryTabs({ tab, teacherCount, groupCount, onChange })`.
- `Directory` owns `selectedMemberId`, `selectedSubgroupId`, `teacherQuery`, `groupQuery`, and `mobileDetailOpen`.

- [ ] **Step 1: Write failing tab and page-state tests**

Render with `MemoryRouter` at `/directory?tab=groups`; assert Groups is selected and its searchbox is present. Change to Docenti and assert the URL becomes `?tab=teachers`, the teacher query is independent, and back navigation restores Groups.

```tsx
expect(screen.getByRole("tab", { name: /Gruppi/ }).getAttribute("aria-selected")).toBe("true");
await user.click(screen.getByRole("tab", { name: /Docenti/ }));
expect(screen.getByRole("tab", { name: /Docenti/ }).getAttribute("aria-selected")).toBe("true");
expect(screen.getByRole("searchbox", { name: "Cerca docenti" })).toBeTruthy();
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test --workspace web -- DirectoryTabs.test.tsx Directory.test.tsx`

Expected: FAIL because the current page has two simultaneous sections and no tabs.

- [ ] **Step 3: Implement semantic tabs and URL persistence**

Use `useSearchParams`. Clicking a tab uses `setSearchParams({ tab: nextTab })`; do not use `replace`, so browser Back restores the prior tab. Tabs use native buttons with `role="tab"`, `aria-selected`, and controlled panel IDs.

```tsx
<DirectoryTabs
  tab={tab}
  teacherCount={members.length}
  groupCount={subgroups.length}
  onChange={(next) => setSearchParams({ tab: next })}
/>
```

- [ ] **Step 4: Establish pane layout and state rules**

Create `.directory-layout` with a 390 px list column and flexible detail column from 1024 px upward. Align the detail panel with the tabs; keep search and results in the left pane. Below 1024 px, CSS uses `mobileDetailOpen` classes to show either list or detail and exposes a `Torna a tutti…` button. Selecting a row sets `mobileDetailOpen` to true; Back sets it to false. Store the list scroll offset in a ref before opening a mobile detail and restore it after Back.

- [ ] **Step 5: Run tests and commit**

Run: `npm test --workspace web -- DirectoryTabs.test.tsx Directory.test.tsx`

Expected: PASS for tab/URL state. Continue rendering the existing subgroup and teacher content inside the new panes until Tasks 3–4 replace those views.

```bash
git add web/src/pages/Directory.tsx web/src/pages/Directory.test.tsx web/src/components/DirectoryTabs.tsx web/src/components/DirectoryTabs.test.tsx web/src/index.css
git commit -m "feat: add responsive rubrica shell"
```

### Task 3: Teacher Contact List and Detail

**Files:**
- Create: `web/src/components/TeacherDirectory.tsx`
- Create: `web/src/components/TeacherDirectory.test.tsx`
- Create: `web/src/components/TeacherDetail.tsx`
- Create: `web/src/components/TeacherDetail.test.tsx`
- Modify: `web/src/pages/Directory.tsx`
- Modify: `web/src/pages/Directory.test.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: grouped/filtered teacher data from Task 1.
- Produces: `TeacherDirectory({ groups, selectedId, scope, onScopeChange, onSelect })`.
- Produces: `TeacherDetail({ member, isAdmin, allSubgroups, onAdd, onRemove, onInspect })`.
- Reuses: `MemberSubgroupCell` for authorized membership changes.

- [ ] **Step 1: Write failing list tests**

Assert letter headings, contact rows, full filter labels (`Docenti medie`, `Docenti superiori`), selection, empty search state, and alphabet links only for present letters.

```tsx
expect(screen.getByRole("button", { name: "Docenti medie" })).toBeTruthy();
expect(screen.getByRole("heading", { name: "A" })).toBeTruthy();
await user.click(screen.getByRole("button", { name: /Annalisa Rossetti/ }));
expect(onSelect).toHaveBeenCalledWith("teacher-1");
```

- [ ] **Step 2: Write failing detail tests**

Assert name, email, all assigned groups, and admin-only membership controls. For teachers, group chips remain inspectable without exposing edit controls.

```tsx
expect(screen.getByRole("heading", { name: "Annalisa Rossetti" })).toBeTruthy();
expect(screen.getByRole("link", { name: "annalisa.rossetti@rainerum.it" }).getAttribute("href"))
  .toBe("mailto:annalisa.rossetti@rainerum.it");
expect(screen.queryByRole("button", { name: "Rimuovi da CDC 1A" })).toBeNull();
```

- [ ] **Step 3: Run focused tests and confirm they fail**

Run: `npm test --workspace web -- TeacherDirectory.test.tsx TeacherDetail.test.tsx Directory.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement the contact-book list**

Rows are native buttons with initials, full name, email or concise group context, selection state, and at least 44 px height. Letter navigation uses anchors targeting stable `teacher-letter-A` IDs. Scope buttons update controlled state in `Directory`.

- [ ] **Step 5: Implement teacher detail and integrate it**

Use a mailto link, sorted group chips, and the existing `MemberSubgroupCell` admin interactions. Always derive the first filtered teacher when the current selection is absent, but on mobile keep the detail pane hidden until an explicit row selection sets `mobileDetailOpen`.

```ts
const selectedMember = filteredMembers.find(({ id }) => id === selectedMemberId)
  ?? filteredMembers[0];
```

- [ ] **Step 6: Add responsive styles and run tests**

At mobile widths hide the desktop table completely, use a single list column and sticky alphabet rail that does not cover row text. At desktop widths make the detail panel sticky below the application header when its content fits the viewport.

Run: `npm test --workspace web -- TeacherDirectory.test.tsx TeacherDetail.test.tsx Directory.test.tsx MemberSubgroupCell.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/TeacherDirectory.tsx web/src/components/TeacherDirectory.test.tsx web/src/components/TeacherDetail.tsx web/src/components/TeacherDetail.test.tsx web/src/pages/Directory.tsx web/src/pages/Directory.test.tsx web/src/index.css
git commit -m "feat: redesign teacher directory as contact book"
```

### Task 4: Group List, Complete Detail, and Admin Actions

**Files:**
- Create: `web/src/components/GroupDirectory.tsx`
- Create: `web/src/components/GroupDirectory.test.tsx`
- Create: `web/src/components/GroupDetail.tsx`
- Create: `web/src/components/GroupDetail.test.tsx`
- Modify: `web/src/pages/Directory.tsx`
- Modify: `web/src/pages/Directory.test.tsx`
- Modify: `web/src/components/SubgroupDetailsModal.tsx`
- Modify: `web/src/components/SubgroupDetailsModal.test.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `buildDirectorySections`, sorted subgroups, and mutation callbacks already owned by `Directory`.
- Produces: `GroupDirectory({ sections, selectedId, onSelect })`.
- Produces: `GroupDetail({ subgroup, isAdmin, onEdit, onDelete, onEmail })`.
- Preserves: existing `EmailComposer`, subgroup editor dialog, and API calls.

- [ ] **Step 1: Write failing group list tests**

Assert folder headings, group name, description/type, color indicator, complete member count, selected state, and group selection.

```tsx
expect(screen.getByRole("heading", { name: "Consigli di Classe · Liceo" })).toBeTruthy();
expect(screen.getByText("11 membri")).toBeTruthy();
await user.click(screen.getByRole("button", { name: /CDC 5 Liceo/ }));
expect(onSelect).toHaveBeenCalledWith("group-5l");
```

- [ ] **Step 2: Write failing complete-detail tests**

Supply 11 members and assert all 11 names render immediately, no `Mostra tutti` exists, email follows the final member in document order, and edit/delete are admin-only.

```tsx
expect(screen.getAllByTestId("group-member")).toHaveLength(11);
expect(screen.queryByText(/Mostra tutti/i)).toBeNull();
const lastMember = screen.getAllByTestId("group-member").at(-1)!;
const email = screen.getByRole("button", { name: "Invia email al gruppo" });
expect(lastMember.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

- [ ] **Step 3: Run focused tests and confirm they fail**

Run: `npm test --workspace web -- GroupDirectory.test.tsx GroupDetail.test.tsx Directory.test.tsx SubgroupDetailsModal.test.tsx`

Expected: FAIL because groups are cards and details are modal-only.

- [ ] **Step 4: Implement grouped list and detail panel**

Render every member sorted by name with initials and email. Do not render color codes, technical group email, or update timestamps in read mode. Place `Invia email al gruppo` after the member list and disable it only when the group has no members.

- [ ] **Step 5: Preserve admin editing in the editor only**

Keep name, folder, description, color, and memberships in the existing dialog. Move current card-level edit/delete callbacks to explicit icon buttons in `GroupDetail`, each with an accessible name. Keep `window.confirm` before delete and preserve conflict error messages.

- [ ] **Step 6: Integrate desktop alignment and mobile navigation**

The desktop `GroupDetail` occupies the right column beginning beside the Docenti/Gruppi selector. Search and group list occupy the left column below the selector. Mobile uses a full-width detail and a text Back button; it never truncates members.

- [ ] **Step 7: Run tests and commit**

Run: `npm test --workspace web -- GroupDirectory.test.tsx GroupDetail.test.tsx Directory.test.tsx SubgroupDetailsModal.test.tsx EmailComposer.test.tsx`

Expected: PASS.

```bash
git add web/src/components/GroupDirectory.tsx web/src/components/GroupDirectory.test.tsx web/src/components/GroupDetail.tsx web/src/components/GroupDetail.test.tsx web/src/components/SubgroupDetailsModal.tsx web/src/components/SubgroupDetailsModal.test.tsx web/src/pages/Directory.tsx web/src/pages/Directory.test.tsx web/src/index.css
git commit -m "feat: add responsive group master detail"
```

### Task 5: Directory Acceptance Verification

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Verifies every interface produced by Tasks 1–4.

- [ ] **Step 1: Run automated checks**

```bash
npm test --workspace web
npm test --workspace server -- users.test.ts subgroups.test.ts
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Verify teacher and group acceptance at four widths**

At 375, 768, 1024, and 1440 px verify both tabs as teacher and admin. Check URL-backed tabs, independent searches, all four teacher scopes, alphabet navigation, selection, Back restoration, complete group member lists, detail alignment, final email action, admin-only actions, keyboard focus, 200% zoom, and absence of horizontal overflow.

- [ ] **Step 3: Verify mutation regressions**

As admin, create a group, edit name/folder/description/color/members, send an email, remove a membership, and delete the temporary group. As teacher, confirm those mutation controls are absent while allowed details remain readable.

- [ ] **Step 4: Commit verification fixes if any**

If verification required changes:

```bash
git commit -m "fix: complete responsive directory acceptance"
```

If no files changed, do not create an empty commit.
