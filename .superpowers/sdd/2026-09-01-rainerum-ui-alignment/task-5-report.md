# Task 5 report — Orario portal alignment

**Status:** complete for the approved Orario UI scope.

## Deliverables

- Implementation commit: `b229004` (`style(ui): align Orario with Rainerum portal`).
- Baseline: `a1f37898b2d80ca88f72af0c190566678321d904`.
- Exact-base review artifact: `.superpowers/sdd/2026-09-01-rainerum-ui-alignment/review-a1f3789..b229004.diff` (1,361 lines, 81,523 bytes; SHA-256 `19b0ad78c9689819927bf54eddb8a3d2440c784d155408f407a5bf8574d1cc37`). `git apply --check --reverse` passed against the final Orario tree.

The public schedule shell, authenticated admin shell, personal login, privacy page, and terms page now use the official full Rainerum logo at desktop widths and compact mark below 768 px, with the secondary `Orario` service label. Brand links have explicit accessible names and decorative duplicate image text is suppressed. Existing URLs, public schedule navigation, date/school/audience selection, login flow, role-derived admin navigation, account display, and logout action remain unchanged.

The existing CSS and Lycoris 1.1.2 integration were remapped to the approved institutional tokens and warm portal geometry: red brand interaction, warm page/surface/line colors, stronger control boundaries, visible focus treatment, cards, forms, calendar, tables, navigation, publication surfaces, and bottom-sheet/modal presentation. Native form controls explicitly retain the light warm surface even when the browser has a dark system preference. Existing Lycoris wrappers and the vendored package were preserved; no package or framework version changed.

Timetable-entry colors, substitution/variation distinctions, publication success/warning/danger states, and the Google provider mark remain semantic data/state colors rather than product accents. No route, authentication rule, role permission, API handler, server action, database query/schema/migration, publication operation, import action, timetable/date/school behavior, dependency, deployment, or production data changed.

## Test-first evidence

The responsive official-brand and accessible-name contracts were introduced red-first in `tests/unit/auth/admin-pages.test.tsx` and `tests/unit/publications/public-page.test.tsx`. The first focused run failed five assertions because the public shell, admin shell, login, privacy, and terms surfaces lacked `aria-label="Orario Rainerum"` and the full/compact asset hierarchy. After the minimal shell changes, the same focused run passed 34/34. The retained admin-layout, timetable component, timetable primitive, auth-page, and public-page suite then passed 58/58.

CSS-only presentation work was verified with static token/diff checks and responsive browser inspection. Existing behavior tests remained authoritative for auth, public routing, publication, import, timetable, and admin operations.

## Verification

| Command / check | Result |
| --- | --- |
| Final full serial Vitest run against disposable PostgreSQL 17 | 73 files passed, 1 guarded real-template file skipped; 485 tests passed, 1 skipped. |
| Focused timetable/auth/public UI run | 5 files, 58 tests passed. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run build` | Passed; every application/API route and the notification worker built successfully. |
| `git diff --check` and cached diff check | Passed. |
| Exact review diff reverse-apply check | Passed. |
| Preservation check | Orario tracked tree/staging are clean after commit; the pre-existing root `.DS_Store` SHA-256 remains `1647b93b3290af3dd464ea476ab785ea81ee772871d35f010da3bbad3ba8e7eb`. The nested pilot worktree remains at `d49a90050f6c8f3f071c2a4218039c2a7ae8d9b1` with its known untracked files untouched. |

The disposable database ran locally on port 55438, received repository migrations and development-safe publication/auth fixtures, and was used for the serial integration suite and authenticated visual states. The local auth fixture used fake credentials only. No shared or production database/account was accessed.

One final-suite attempt exposed a pre-existing probabilistic test-fixture edge case in the publication receipt tampering test: changing only the final Base64URL character can produce a noncanonical spelling that decodes to the same signature bytes. The failing test passed in isolation and the root cause was demonstrated without changing publication code or expanding this UI task. The subsequent complete serial run passed 485/485 runnable tests. Existing Better Auth missing-fake-Google-config warnings and the guarded real-template skip remain unchanged.

## Responsive inspection

The production build was inspected with safe local fixtures across the public schedule, personal login, scheduler/admin dashboard, week calendar, import form, publication list, and share bottom sheet.

- At 390×844, the compact mark and `Orario` label are shown on public, login, and authenticated surfaces; desktop navigation collapses to the existing mobile navigation.
- At 767×844, the compact identity remains active; at 768×844, the official full logo appears. Public and admin shells have no horizontal overflow at either boundary.
- At 1440×900, the full logo, desktop navigation, calendar/card/table layouts, and publication actions are visible without horizontal overflow.
- Computed public tokens were `--brand: #b8181b`, `--page: #fff8f7`, and `--focus: #004075`; active navigation/date controls use the institutional red.
- The mobile share sheet retains its existing actions and shows the blue keyboard focus ring on the focused PDF action.
- The import date/file controls render on the explicit warm light surface after the visual fix.

Screenshots:

- `/private/tmp/orario-task5-ui/public-mobile-390x844.png`
- `/private/tmp/orario-task5-ui/public-767x844.png`
- `/private/tmp/orario-task5-ui/public-768x844.png`
- `/private/tmp/orario-task5-ui/public-desktop-1440x900.png`
- `/private/tmp/orario-task5-ui/public-share-mobile-390x844.png`
- `/private/tmp/orario-task5-ui/login-mobile-390x844.png`
- `/private/tmp/orario-task5-ui/login-desktop-1440x900.png`
- `/private/tmp/orario-task5-ui/admin-mobile-390x844.png`
- `/private/tmp/orario-task5-ui/admin-767x844.png`
- `/private/tmp/orario-task5-ui/admin-768x844.png`
- `/private/tmp/orario-task5-ui/admin-desktop-1440x900.png`
- `/private/tmp/orario-task5-ui/admin-weeks-mobile-390x844.png`
- `/private/tmp/orario-task5-ui/admin-weeks-desktop-1440x900.png`
- `/private/tmp/orario-task5-ui/admin-import-mobile-390x844.png`
- `/private/tmp/orario-task5-ui/admin-publications-mobile-390x844.png`
- `/private/tmp/orario-task5-ui/admin-publications-desktop-1440x900.png`

No deployment, push, dependency upgrade, React/Next change, broad refactor, real credential, or production mutation was performed. The root `AGENTS.md` references `RTK.md`, but no such file was present in the workspace; the committed Task 5 brief, UI plan/specification, ledger, repository tests, and existing code contracts supplied the implementation authority.
