# Task 5 report — Orario portal alignment

**Status:** complete for the approved Orario UI scope.

## Review fix round 1 — visual snapshot integrity

- Review commit: `afeefc9bea171bf8797846b4d9ceea8939d0ab12` (`test(ui): refresh Rainerum visual baselines`).
- Review baseline: `b2290044d6f6e541b9f75b16c06bc35fbeeb1115`.
- Exact review artifact: `.superpowers/sdd/2026-09-01-rainerum-ui-alignment/review-b229004..afeefc9.diff` (42,008 lines, 2,810,459 bytes; SHA-256 `cdb6716d92b626ca51ec7ec309ca97d8996983e09afaa645c0b376015155b14a`). `git apply --check --reverse` passed against the review commit.

All 21 tracked Playwright baselines affected by the intentional Task 5 identity and token changes were regenerated against a repository-migrated disposable PostgreSQL 17 database, then individually inspected. The captures show the approved official full desktop logo or compact mobile mark, institutional red navigation and actions, warm page/surface/line tokens, and unchanged semantic timetable/variation/state colors. No unrelated visual baseline and no production file changed in this review.

Affected baselines:

- Public timetable, nine full-page screenshots: `mobile-{class,teacher,school}-darwin.png` at a 390×844 viewport produce 390×912 PNGs; `tablet-{class,teacher,school}-darwin.png` at a 768×1024 viewport produce 768×1092 PNGs; `desktop-{class,teacher}-darwin.png` at a 1280×1024 viewport produce 1280×1078 PNGs; `desktop-school-darwin.png` produces 1280×1616. The filename describes the configured viewport category, while the dimensions are larger where `fullPage: true` captures document height.
- Admin timetable, ten viewport screenshots (`fullPage: false`): `scuola`, `classe`, and `docente` at mobile 390×844, tablet 768×1024, and desktop 1280×1024, plus `scuola-sta-itt-desktop-darwin.png` at 1280×1024.
- Admin variations, two dialog-element screenshots: `variation-editor-mobile-darwin.png` is 390×743 and `variation-editor-desktop-darwin.png` is 496×1024. These dimensions are the captured dialog bounds, not page viewport labels.

Twenty captures retain their prior pixel dimensions. The public desktop school full-page capture changed from 1280×1627 to 1280×1616 because of the intentional Task 5 layout geometry. During normal comparison, the first generated `classe-desktop` baseline proved to contain a one-pixel-narrow antialias sample at the official logo edge; two normal runs produced the same stable 109×25 logo raster used by the other desktop admin captures. Only that baseline was recaptured and re-inspected before the final comparison.

The visual-spec fixtures were brought up to the already-migrated application contract without modifying production behavior: the admin variations fixture now uses `substitution_replaced_teachers`, starts its unrelated historical group cancelled, waits for the committed revision before asserting the newly added atomic cards, and selects the outgoing teacher explicitly in the dedicated substitution flow. The public foreground assertions now expect the approved Task 5 ink/red values. A red full-suite run also reproduced the existing asynchronous mobile-grid measurement race (the `fit` mode was visible before body geometry settled); the test now polls the geometry contract itself. The focused check then passed 3/3 repeated runs.

Review verification:

| Command / check | Result |
| --- | --- |
| Affected specs, normal comparison mode (no snapshot update) | 37/37 passed across `public-timetable`, `admin-timetable`, and `admin-variations`; all 21 baselines matched. |
| Full Playwright suite, normal comparison mode | 53/53 passed. |
| Focused mobile-grid readiness regression | 3/3 repeated runs passed after the red full-suite reproduction. |
| Full serial Vitest suite against disposable PostgreSQL 17 | 73 files passed, 1 guarded real-template file skipped; 485 tests passed, 1 skipped. |
| Focused timetable/auth/public UI run | 5 files, 58 tests passed. |
| `npm run typecheck` / `npm run lint` / `npm run build` | Passed. |
| `git diff --check`, cached diff check, exact review diff reverse-apply | Passed. |

The first full Vitest invocation was sandboxed from localhost and failed only with `connect EPERM 127.0.0.1:55439`; the identical serial command was rerun with permitted access to the disposable database and passed 485/485 runnable tests. The optional Base64URL fixture was not changed because no failure occurred in this review run and there was no new isolated evidence requiring it. Playwright still emits known non-failing development-server warnings for a deliberately stale publication conflict, missing fake Google configuration, an early-closed response stream, and occasional hydration/LCP diagnostics; normal comparison and the complete suite both exited successfully.

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
