# Task 3 report — Intercomunica portal alignment

**Status:** complete for the approved Intercomunica UI scope.

## Deliverables

- Implementation commit: `053cf0effba1266c889b95b973f55c8882e7d01a` (`style(ui): align Intercomunica with Rainerum portal`).
- Review-fix commit: `4848f77353591732b0acd840b38957a323e3616a` (`fix(ui): prevent compact portal overflow`).
- Baseline: `332cd394ae5c71572d6e223dac5451e0839ac1f9`.

The authenticated shell now uses the official full Rainerum logo on desktop and compact official mark below 768 px, retains `Intercomunica` as the service identifier, exposes a skip link and labelled primary navigation, preserves `NavLink` active-route semantics, and keeps the existing user, role, and logout controls. The public login shell uses the same responsive mark hierarchy and institutional red action.

Focused portal classes in `web/src/index.css` cover the existing page headings, cards, form controls, buttons, feedback, tabs, tables, dialogs, resource/event cards, empty/loading/error states, FullCalendar controls, focus treatment, and responsive navigation. Bacheca, Calendar, Directory, Admin Settings, shared-resource list/editor, and the existing modal/picker children use those classes. The remaining literal blue event/category values are unchanged data-encoding colors, not product accents.

No route, redirect, role condition, API path, callback, state/effect, form value, label, workflow, dependency, React version, or data behavior changed. No Lycoris dependency, deployment, or production migration was introduced.

## Test-first and review evidence

`web/src/App.test.tsx` was added red-first for the official responsive marks, skip target, labelled navigation, current-route semantics, admin-only settings destination, and retained logout control. `web/src/pages/Login.test.tsx` was added red-first for the responsive official marks and unchanged Google login destination. Existing Bacheca, Admin Settings tab/focus/draft-retention, Admin Resources, and Resource Editor tests remained green after the presentation changes.

The independent review of `332cd394..053cf0e` identified a suppressed skip-target focus outline, compact FullCalendar and Admin Settings overflow, and two low-contrast foregrounds. Commit `4848f77` restores the visible focus treatment, wraps compact FullCalendar button groups, stacks all four affected admin rows below `sm`, adds `min-w-0` to their inputs, and raises placeholder/badge contrast to approximately 5.9:1. The focused re-review returned PASS with no new regression.

## Verification

| Command / check | Result |
| --- | --- |
| `npm test` with `docker-compose.dev.yml` PostgreSQL | 15 files, 121 tests passed. |
| `npm test --workspace web` | 8 files, 38 tests passed. |
| `npm run typecheck` | Server and web typechecks passed. |
| `npm run build` | Server build and Vite production build passed. |
| `git diff --check 332cd394..4848f77` | Passed. |
| Static product-accent check | No `blue-*` utility remains in production TSX. Existing event/category hex colors remain only where they encode data. |
| Independent review | PASS after the `4848f77` fix. |

The first sandboxed baseline run could not open local test listeners, and the first listener-permitted run passed 118 tests but lacked PostgreSQL. Starting the repository-supported `db` service with `docker compose -f docker-compose.dev.yml up -d db` removed both environmental limitations; the final full suite passed 121/121.

## Responsive inspection and caveats

The local Vite login route was inspected in the in-app Chromium browser at 390×844 and 1440×900. At 390 px the compact 256×256 mark is visible, the full logo is hidden, and `document.body.scrollWidth === window.innerWidth === 390`. At 1440 px the full 900×392 logo is visible, the compact mark is hidden, and body/viewport widths both equal 1440. The Google destination remains `/api/auth/google`.

Screenshots:

- `/private/tmp/intercomunica-task3-login-mobile.png`
- `/private/tmp/intercomunica-task3-login-desktop.png`

The repository does not expose a safe browser-only mock session, so no private credentials were requested and no test-only auth behavior was added. The exact remaining manual browser states for Task 7 are an authenticated admin at `/`, `/directory`, `/calendario`, and `/admin/settings` at 390 px and 1440 px, checking the Bacheca cards/empty states, Directory tables/dialogs, FullCalendar view toolbar/event modal, both Settings tabs/resource editor, focus rings, and horizontal overflow. Their DOM behavior is covered by the retained web tests, but those private states were not screenshot-verified in this task.

No push, deployment, React upgrade, Lycoris installation, or production migration was performed. The linked worktree remains in place on `codex/shared-resources-ui`.
