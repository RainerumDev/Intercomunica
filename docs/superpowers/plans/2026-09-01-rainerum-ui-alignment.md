# Rainerum UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Intercomunica, Prenotazioni, and Orario visibly part of one Rainerum portal through the official marks, shared institutional tokens, and aligned shells without changing application behavior.

**Architecture:** First fast-forward Orario's complete pilot branch onto `main`, then apply the same documented visual contract independently in each repository so deployments remain decoupled. Reuse current component seams, preserve navigation and route behavior, and recommend Lycoris for future compatible UI work rather than forcing a React migration now.

**Tech Stack:** React 18/Vite/Tailwind (Intercomunica), React 19/Next.js 16/CSS (Prenotazioni), React 19/Next.js 16/Lyco UI 1.1.2/CSS (Orario), Vitest, ESLint, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-shared-resources-and-rainerum-ui-design.md`

## Global Constraints

- Use the official full and compact Rainerum logos without redrawing them.
- Use one institutional red accent across all services; do not assign product-specific colors.
- Preserve routes, labels, permissions, actions, form behavior, and data behavior.
- Keep each repository independently buildable and deployable.
- Lycoris is the preferred future component library, subject to compatibility checks.
- Do not upgrade Intercomunica to React 19 in this work.
- Do not deploy or migrate production.

---

### Task 1: Fast-forward Orario pilot work onto main

**Files:**
- Repository: `../orario`
- No content changes in this task.

**Interfaces:**
- Consumes: branch `codex/pilot-foundation` at `9ddfbc5` or its verified descendant.
- Produces: `main` pointing to exactly the same commit before visual changes.

- [ ] **Step 1: Verify branch relation and both worktree states**

Run: `git status --short --branch`

Run: `git -C .worktrees/pilot-foundation status --short --branch`

Run: `git rev-list --left-right --count main...codex/pilot-foundation`

Expected: `main` has zero unique commits, pilot is ahead, and only known local `.DS_Store`/instruction files are untracked.

- [ ] **Step 2: Run the pilot baseline gates before promotion**

From `.worktrees/pilot-foundation` run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all exit 0. If any fails, stop and diagnose before moving `main`.

- [ ] **Step 3: Fast-forward main explicitly**

From the `orario` main checkout run:

```bash
git merge --ff-only codex/pilot-foundation
```

Expected: `main` points to the pilot tip; no merge commit and no untracked files added.

- [ ] **Step 4: Verify the promoted tree**

Run: `git rev-parse main`

Run: `git rev-parse codex/pilot-foundation`

Expected: identical commit IDs.

---

### Task 2: Add official logo assets and the shared token contract

**Files:**
- Create: `web/public/rainerum-logo-full.png`
- Create: `web/public/rainerum-logo-mark.png`
- Modify: `web/src/index.css`
- Create: `../prenotazioni/public/rainerum-logo-full.png`
- Create: `../prenotazioni/public/rainerum-logo-mark.png`
- Modify: `../prenotazioni/src/app/globals.css`
- Create: `../orario/public/rainerum-logo-full.png`
- Create: `../orario/public/rainerum-logo-mark.png`
- Modify: `../orario/src/app/globals.css`
- Modify: `../orario/src/app/lyco-ui.css`

**Interfaces:**
- Produces: local `/rainerum-logo-full.png` and `/rainerum-logo-mark.png` in every app.
- Produces: equivalent institutional tokens for brand, ink, muted text, page, surface, subtle/strong borders, focus, success, warning, danger, radii, and shadows.

- [ ] **Step 1: Copy and optimize the supplied official assets**

Use the exact supplied sources:

```text
/Users/delugan/Library/CloudStorage/GoogleDrive-kevin.delugan@juvenes.it/.shortcut-targets-by-id/1S-3CWTQ4mlIe51MXzQYDHRPlSFptex5f/Juvenes/LOGHI E RISORSE/RAINERUM - LOGHI/UFFICIALI/01o@300x.png
/Users/delugan/Library/CloudStorage/GoogleDrive-kevin.delugan@juvenes.it/.shortcut-targets-by-id/1S-3CWTQ4mlIe51MXzQYDHRPlSFptex5f/Juvenes/LOGHI E RISORSE/RAINERUM - LOGHI/UFFICIALI/00o@300x.png
```

Preserve transparency and aspect ratio. Produce a desktop full mark no wider than 900 px and a compact mark no wider than 256 px; do not alter colors or geometry. Verify each output with `file` and an image dimension inspector.

- [ ] **Step 2: Define equivalent institutional tokens**

Use the official red `#b8181b` as `--brand`, with `#8f1114` for hover/active contrast. Align the remaining tokens to the approved light portal direction: `--ink: #261816`, `--muted: #6a5552`, `--page: #fff8f7`, `--surface: #ffffff`, `--surface-soft: #fff0ee`, `--line: #dbbeba`, and `--focus: #004075`.

Map these values to each app's existing variable names instead of renaming every consumer. Keep semantic success/warning/danger colors distinct because they communicate state, not product identity.

- [ ] **Step 3: Build every project before shell edits**

Run Intercomunica `npm run build`, Prenotazioni `pnpm build`, and Orario `npm run build`.

Expected: all exit 0 and the assets are included in each output.

- [ ] **Step 4: Commit assets/tokens in each repository**

Use `style(ui): add Rainerum institutional assets and tokens` in each repository, staging only that repository's files.

---

### Task 3: Align the Intercomunica shell and new bacheca styling

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`
- Modify: `web/src/pages/Login.tsx`
- Modify: `web/src/pages/Bacheca.tsx`
- Modify: `web/src/pages/AdminSettings.tsx`
- Modify: `web/src/pages/Calendario.tsx`
- Modify: `web/src/pages/Directory.tsx`
- Modify: `web/src/components/ResourceCard.tsx`

**Interfaces:**
- Preserves: route table, auth redirects, nav destinations, logout, API requests, calendar interactions, directory behavior, and settings actions.
- Produces: full logo desktop header, compact logo mobile header, shared page-heading/card/button/input styles, and responsive navigation.

- [ ] **Step 1: Refactor only shell markup needed for the approved header**

Keep the existing `NavLink` destinations and admin condition. Add semantic brand markup using the full logo above the desktop breakpoint and compact mark below it. Add a skip link and preserve the current authenticated user controls.

- [ ] **Step 2: Replace utility-only brand colors with institutional component classes**

Add focused CSS classes for shell, page headings, cards, form controls, feedback, tabs, and mobile navigation. Keep FullCalendar integration variables but map its buttons/today state to the institutional tokens.

- [ ] **Step 3: Apply the classes to current pages without rewriting logic**

Do not change state, effects, callbacks, request paths, conditions, or form values. Limit JSX changes to wrappers, class names, logo images, and accessible labels.

- [ ] **Step 4: Run Intercomunica gates**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all exit 0.

- [ ] **Step 5: Commit Intercomunica alignment**

```bash
git add web
git commit -m "style(ui): align Intercomunica with Rainerum portal"
```

---

### Task 4: Align the Prenotazioni shell and surfaces

**Files:**
- Modify: `../prenotazioni/src/components/app-shell.tsx`
- Modify: `../prenotazioni/src/app/globals.css`
- Modify: `../prenotazioni/src/app/layout.tsx`
- Modify: `../prenotazioni/src/components/mobile-nav.tsx`
- Modify: `../prenotazioni/src/components/user-menu.tsx`

**Interfaces:**
- Preserves: desktop and mobile nav destinations, role-specific links, current-user loading, logout, booking actions, incident flows, admin routes, and metadata meaning.
- Produces: Rainerum logo hierarchy and the same portal shell/token language as Intercomunica.

- [ ] **Step 1: Add the official brand hierarchy to `AppShell`**

Show the full logo plus `Prenotazioni` on desktop and compact mark plus `Prenotazioni` on mobile. Preserve `Link` targets, server-side user lookup, navigation arrays, role links, and mobile layout calculation.

- [ ] **Step 2: Remap the existing design system to institutional tokens**

The current red palette is close to the approved direction. Normalize exact token values, header dimensions, page width, heading scale, border radii, cards, focus, and mobile nav treatment. Do not replace semantic status colors or alter class names consumed by tests.

- [ ] **Step 3: Run Prenotazioni gates**

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `pnpm build`

Expected: all exit 0.

- [ ] **Step 4: Commit Prenotazioni alignment**

```bash
git add public src
git commit -m "style(ui): align Prenotazioni with Rainerum portal"
```

---

### Task 5: Align Orario while retaining Lycoris primitives

**Files:**
- Modify: `../orario/src/ui/timetable/public-schedule-shell.tsx`
- Modify: `../orario/src/ui/admin/admin-shell.tsx`
- Modify: `../orario/src/app/globals.css`
- Modify: `../orario/src/app/lyco-ui.css`
- Modify: `../orario/src/app/login/page.tsx`
- Modify: `../orario/src/ui/legal/privacy.tsx`
- Modify: `../orario/src/ui/legal/terms.tsx`

**Interfaces:**
- Preserves: public schedule URLs, audience/week/day/school navigation, admin navigation, auth actions, timetable interactions, publications, and substitution workflows.
- Preserves: `@loreschaeffer/lyco-ui` wrappers in `src/ui/primitives/`.
- Produces: the same Rainerum brand hierarchy and institutional token mapping as the other services.

- [ ] **Step 1: Add logo hierarchy to public and admin shells**

Keep every `href`, `ScheduleNavigation` prop, role-derived navigation entry, and logout action unchanged. Replace text-only brands with official mark plus the service label `Orario`.

- [ ] **Step 2: Map Lycoris overrides and existing CSS to the shared tokens**

Retain package imports and wrapper components. Update token overrides in `lyco-ui.css`; then replace the previous blue/gold product identity in shell and component styles with the institutional red accent. Keep timetable category/state colors only where they encode schedule meaning and document those exceptions.

- [ ] **Step 3: Run focused UI tests before the full gate**

Run: `npm test -- tests/unit/timetable/components.test.tsx tests/unit/timetable/primitives.test.tsx tests/unit/auth/admin-layout.test.tsx`

Expected: PASS. If visual snapshots intentionally differ, review the rendered screenshots before updating baselines; never update them blindly.

- [ ] **Step 4: Run Orario gates on main**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Expected: all exit 0.

- [ ] **Step 5: Commit Orario alignment**

```bash
git add public src
git commit -m "style(ui): align Orario with Rainerum portal"
```

---

### Task 6: Add durable UI guidelines with Lycoris-first policy

**Files:**
- Create: `docs/ui-guidelines.md`
- Create: `../prenotazioni/docs/ui-guidelines.md`
- Create: `../orario/docs/ui-guidelines.md`
- Modify: each repository `README.md` to link its local guide.

**Interfaces:**
- Produces: a local, discoverable policy in every independently deployed repository.
- References: `https://ui.lycoris.it/docs/introduction` and `https://ui.lycoris.it/docs/installation`.

- [ ] **Step 1: Write the common policy**

Each guide must state:

- use official local Rainerum marks and institutional tokens;
- use no product-specific accent colors;
- prefer Lycoris for new compatible components and surfaces;
- pin the Lycoris version and import its stylesheet once at the app root;
- use adapters for framework routing rather than forking components;
- check React, Node, peer dependencies, GitHub Packages authentication, accessibility, build, and deployment compatibility first;
- do not migrate an existing framework/runtime merely for cosmetic consistency;
- keep semantic status and data-encoding colors distinct from brand colors.

Add the app-specific compatibility note: Orario already uses Lycoris 1.1.2; Prenotazioni is React 19 but has not adopted Lycoris; Intercomunica remains React 18 and requires a dedicated React migration before the React target can be adopted.

- [ ] **Step 2: Link the guide from each README**

Add one concise `Linee guida UI` link near the stack or development section. Do not duplicate installation secrets or PAT values.

- [ ] **Step 3: Commit documentation in each repository**

Use `docs(ui): add Lycoris-first Rainerum guidelines` in each repository.

---

### Task 7: Perform cross-service visual and regression verification

**Files:**
- None expected; a failing verification returns execution to the task that owns the affected files before this task is rerun.

**Interfaces:**
- Verifies: shared identity, responsive behavior, accessibility, and unchanged application behavior across all three services.

- [ ] **Step 1: Run all automated gates again from clean worktrees**

Intercomunica: `npm test && npm run typecheck && npm run build`.

Prenotazioni: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.

Orario: `npm test && npm run typecheck && npm run lint && npm run build`.

Expected: every command exits 0.

- [ ] **Step 2: Verify desktop at 1440 px and mobile at 390 px**

For public pages, verify logo choice, header, navigation, headings, cards, forms, empty/error/loading states, focus rings, and no horizontal overflow. For private pages, use existing local test authentication; ask the user to sign in only if a real session is necessary.

- [ ] **Step 3: Compare the three services side by side**

Confirm the same institutional red, typography, logo rules, page background, card geometry, focus treatment, and heading hierarchy. Confirm no service-specific accent remains except semantic or data-encoding colors.

- [ ] **Step 4: Review repository status and stop**

Run `git status --short` in all three repositories. Confirm only intended files and known pre-existing untracked files remain. Do not deploy, push, delete the pilot branch, or migrate production.
