# Task 4 report — Prenotazioni portal alignment

**Status:** complete for the approved Prenotazioni UI scope.

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
