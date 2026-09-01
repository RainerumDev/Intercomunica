# Task 4 report — Prenotazioni portal alignment

**Status:** complete for the approved Prenotazioni UI scope.

## Review fix round 2

- Review-fix commit: `b58f7ffce8d5fe16937ad7467babc30405c8cba1` (`fix(ui): focus refreshed booking summary`).
- Review baseline: `5bbb3dfd85c441381abbbfeedbecba82b54aff57`.
- Exact-base review artifact: `.superpowers/sdd/2026-09-01-rainerum-ui-alignment/review-5bbb3df..b58f7ff.diff` (151 lines, 8,689 bytes). `git apply --check --reverse` passed against the final Prenotazioni tree.

The successful-cancellation focus path now survives the server refresh that removes the booking card and its trigger. A narrow client focus region owns the stable `Elenco prenotazioni` heading with `tabindex="-1"`, remembers that a successful cancellation requested post-refresh focus, and moves focus only after the rendered next-occurrence key changes. Back and Escape continue to close the dialog and restore the still-present trigger through the existing effect; failed cancellation requests do not request refreshed-page focus. No authentication, permission, route, request payload, API handler, database service, availability, conflict, or cancellation decision logic changed.

The delayed Playwright cancellation test now forwards the request with `route.fetch()`, holds only the real route response, and fulfills with that real response. It proves pending focus/inert containment, the actual database-backed removal of the recurring booking, and final focus on the refreshed list heading. A separate browser test proves trigger restoration through both `Torna indietro` and Escape.

Round-two verification:

| Command / check | Result |
| --- | --- |
| Red/green real-route focus contract | Back/Escape passed; successful cancellation failed first because the unchanged heading lacked `tabindex` and focus, then passed after the refresh-stable focus region was added. |
| `pnpm test:e2e` on a fresh migrated/seeded PostgreSQL 17 database | 7 tests passed, including the real mutation/refresh focus contract and separate Back/Escape restoration test. |
| `pnpm test` with the disposable database | 32 files, 148 tests passed. |
| `pnpm typecheck` | Passed. |
| `pnpm lint` | Passed. |
| `pnpm build` | Passed; all application and API routes built successfully. |
| `git diff --check 5bbb3df..b58f7ff` | Passed. |
| Exact review diff reverse-apply check | Passed. |
| Preservation check | Prenotazioni tracked tree and staging are clean after commit; only the pre-existing `.DS_Store` and `mockups/` remain untracked. |

Round-two screenshot:

- `/private/tmp/prenotazioni-task4-review2/calendar-desktop-1440x900.png` — calendar captured at an exact 1440×900 viewport only after the cross-origin iframe body was visible and non-empty (1,816 rendered characters). Independent inspection reports MIME `image/png`, format `png`, width 1440, height 900, and SHA-1 `0a684e51a41af8a39b2656e3f2b5d3940c8cd53f`. The browser screenshot stream identified as JPEG despite its requested extension, so the captured pixels were converted and re-verified as a genuine PNG before acceptance.

The local development server and isolated database were stopped and the disposable database removed after verification. No deployment, dependency update, shared data, or production account was used.

## Review fix round 1

- Review-fix commit: `5bbb3dfd85c441381abbbfeedbecba82b54aff57` (`fix(ui): harden protected shell and booking dialog`).
- Review baseline: `625205fbdcd836181b7b20154b39b3c22546c7b0`.
- Exact-base review artifact: `.superpowers/sdd/2026-09-01-rainerum-ui-alignment/review-625205f..5bbb3df.diff` (439 lines, 38,534 bytes). `git apply --check --reverse` passed against the final Prenotazioni tree.

The protected `/admin`, `/admin/utenti`, `/admin/classi`, `/admin/inventory`, `/admin/riconciliazione`, `/tecnico`, `/tecnico/guasti`, and `/tecnico/richieste` routes now reuse the existing `AppShell` through the smallest route layouts. Their former page-root `main` elements were changed to neutral containers, leaving exactly one main landmark while supplying the Rainerum brand, skip link, responsive primary navigation, role-derived destinations, current-user context, and existing logout action. Page-level permission checks, server actions, routes, and role behavior remain unchanged.

Form boundaries now use the approved darker `#8f706c` strong line token; the computed admin select boundary measures at least 3:1 against its white card surface while semantic status colors remain untouched. A rendered browser contract checks the actual computed colors.

The cancellation dialog now moves focus to the enabled `Torna indietro` control before the confirmation action becomes disabled, marks every branch outside the live modal inert while it is open, handles Tab from any stale/outside active element, and restores each previous inert state on close. The existing trigger-restoration effect remains in place. A delayed-request browser test proves that repeated Tab cannot reach the header or mobile navigation during the pending request and that focus returns to the trigger after close. Recurring-scope radios now share `name="scope"`, expose explicit `OCCURRENCE` and `THIS_AND_FUTURE` values, and retain native arrow-key selection.

Review verification:

| Command / check | Result |
| --- | --- |
| Red/green delayed cancellation browser contract | Failed first on pending focus, then passed after the dialog fix. |
| `pnpm test:e2e` on a fresh migrated/seeded PostgreSQL 17 database | 6 tests passed: teacher booking/cancellation, recurring radio keyboard semantics, delayed focus/inert containment, all admin routes at 767 px, all technician routes at 768 px, and computed 3:1 control-boundary contrast. |
| `pnpm test` with the disposable database | 32 files, 148 tests passed. |
| `pnpm typecheck` | Passed after correcting the DOM-parent type annotation discovered by the first run. |
| `pnpm lint` | Passed. |
| `pnpm build` | Passed; all application and API routes built successfully. |
| `git diff --check 625205f..5bbb3df` | Passed. |
| Exact review diff reverse-apply check | Passed. |
| Preservation check | Prenotazioni staging/tracked tree is clean after commit; only the pre-existing `.DS_Store` and `mockups/` remain untracked. |

Review screenshots:

- `/private/tmp/prenotazioni-task4-review/admin-shell-767.png` — 767×844 admin dashboard with compact mark, skip-link shell, logout, six role-aware destinations in a 3-column/2-row bottom-navigation grid, and single main landmark.
- `/private/tmp/prenotazioni-task4-review/technician-shell-768.png` — 768×844 technician conflict route with full official logo, logout, five role-aware destinations in a 3-column/2-row bottom-navigation grid, and single main landmark.
- `/private/tmp/prenotazioni-task4-review/calendar-desktop-1440.png` — 1440×900 desktop calendar recaptured only after the cross-origin iframe body was visible and non-empty (1,816 rendered characters), showing the loaded month grid and full desktop shell.

The browser captures and all behavior tests used development-safe local authentication, fake integrations, and an isolated disposable database, which was removed after verification. Chrome's local extension added its own body attribute and caused a development-only hydration warning in the server console; it did not alter repository code, test outcomes, or the captured product layout. No deployment, dependency change, shared database, or production account was used.

## Deliverables

- Implementation commit: `625205fbdcd836181b7b20154b39b3c22546c7b0` (`style(ui): align Prenotazioni with Rainerum portal`).
- Baseline: `f35879af56a395b50b380c33b11ec83f6c79850d`.
- Exact-base review artifact: `.superpowers/sdd/2026-09-01-rainerum-ui-alignment/review-f35879a..625205f.diff` (391 lines, 33,488 bytes). `git apply --check --reverse` passed against the final Prenotazioni tree.

The authenticated shell now uses the official full Rainerum logo with the secondary `Prenotazioni` identifier at desktop widths and the official compact mark with the same identifier below 768 px. The brand link has one explicit accessible name, decorative duplicate image text is suppressed, the existing skip link remains, and the header retains the same server-side user lookup, main destinations, role-derived destinations, logout action, local login destination, and Google login form.

The deterministic local login now carries the same responsive brand hierarchy without changing its environment guard, three demo identities, server action, or destinations. The existing design system is remapped to the approved portal geometry: exact institutional tokens, 80 rem page/header bounds, shared title scale, radii, card borders/shadows, form controls, focus rings, status feedback, mobile navigation, booking recap/list cards, bottom-sheet dialog, standalone technician pages, and admin surfaces. Semantic success, warning, danger, booking status, and data-state colors remain distinct.

No route, permission, role condition, API endpoint, server action, fetch request, booking payload, availability/conflict behavior, cancellation behavior, incident workflow, admin workflow, dependency, React/Next version, deployment, or production data changed. No Lycoris dependency was added.

## Test-first evidence

`src/components/app-shell-brand.test.ts` was introduced red-first. Its responsive brand contract failed first because the shell had no `aria-label="Prenotazioni Rainerum"` or official responsive image hierarchy. The retained destination/auth contract was green from the start. A second red cycle covered the local login identity while pinning all three demo roles and the existing `loginAsSeedUser` action. Both contracts then passed after the minimal presentation changes.

Pure CSS changes were verified through static token/diff checks and responsive browser inspection. Existing booking/cancellation behavior was exercised by the repository's retained Playwright test rather than rewritten.

## Verification

| Command / check | Result |
| --- | --- |
| `pnpm test` with a disposable PostgreSQL 17 database | 32 files, 148 tests passed. |
| `pnpm test:e2e` with deterministic local auth/data at 390×844 | 1 test passed: login, four teacher destinations, booking creation, list, cancellation dialog, cancellation. |
| `pnpm test src/components/app-shell-brand.test.ts src/components/mobile-nav-model.test.ts src/components/status-badge.test.ts` | 3 files, 9 tests passed after final formatting. |
| `pnpm typecheck` | Passed. |
| `pnpm lint` | Passed. |
| `pnpm build` | Passed; all application/API routes built successfully. |
| `git diff --check f35879a..625205f` | Passed. |
| Exact review diff reverse-apply check | Passed. |
| Tracked/untracked preservation check | Only the seven intended source/test files are in the implementation commit; pre-existing `.DS_Store` and `mockups/` hashes are unchanged. |

The first sandboxed full test run passed 136 unit tests but could not open the required local PostgreSQL listener. Final verification used a disposable isolated container at port 55433, ran migrations and deterministic seed data there, and removed it afterward. The original repository database service was returned to its prior stopped state without changing or deleting its volume.

## Responsive inspection

The local deterministic admin session was inspected in Chromium at 390×844 and 1440×900 across login, authenticated calendar, booking form, booking list/card, cancellation dialog, and admin dashboard states.

- At 390×844, the compact 256×256 mark is displayed and the full mark is hidden on login and authenticated shell states.
- At 1440×900, the full 900×392 logo is displayed and the compact mark is hidden.
- In every measured state, `document.body.scrollWidth`, document scroll width, and viewport width were equal (390 or 1440); no horizontal overflow was present.
- Computed tokens were `--brand: #b8181b`, `--page: #fff8f7`, and `--focus: #004075`.
- Keyboard focus on the desktop brand link rendered a 3 px solid `rgb(0, 64, 117)` outline.
- The mobile cancellation dialog remained labelled through `aria-labelledby`, opened with focus on `Torna indietro`, and fit within the 390 px viewport.
- Admin navigation retained all five destinations and the dashboard retained its four existing content cards.

Screenshots:

- `/private/tmp/prenotazioni-task4-mobile-login.png` — 390×844 viewport PNG, compact mark.
- `/private/tmp/prenotazioni-task4-mobile-calendar.png` — 390×1223 full-page PNG captured from the 390×844 viewport, calendar and role-aware bottom navigation.
- `/private/tmp/prenotazioni-task4-mobile-booking-form.png` — 390×2324 full-page PNG captured from the 390×844 viewport, fields, recurrence, recap, and actions.
- `/private/tmp/prenotazioni-task4-mobile-cancel-dialog.png` — 390×844 viewport PNG, labelled cancellation bottom sheet over a real disposable booking card.
- `/private/tmp/prenotazioni-task4-desktop-calendar.png` — 1440×1185 full-page PNG captured from the 1440×900 viewport, authenticated calendar, full mark, desktop navigation, and focus ring.
- `/private/tmp/prenotazioni-task4-desktop-admin.png` — 1440×1115 full-page PNG captured from the 1440×900 viewport, admin summary, navigation, cards, and actions.

The screenshots use development-safe local/fake integrations because production validation correctly rejects fake authentication and Google modes. The screenshot harness hid only Next's development issue badge; the inspected application DOM and CSS were unchanged. No real account, private production session, deploy, push, dependency upgrade, or production migration was used.
