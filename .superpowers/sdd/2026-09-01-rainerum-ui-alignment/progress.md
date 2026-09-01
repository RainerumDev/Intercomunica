# SDD ledger — plan: docs/superpowers/plans/2026-09-01-rainerum-ui-alignment.md

Plan base in Intercomunica worktree: `ef3a29a`. Cross-repository baselines are recorded by Task 1 and Task 2 before their first edits.

## Pre-flight task/interface scan

| Task(s) | Producer / consumer or internal check | Finding |
|---|---|---|
| 1 | Orario pilot branch / Tasks 2 and 5 main checkout | Fast-forward makes pilot code canonical before visual edits; clean. |
| 1 | Baseline gates / fast-forward | Tests precede branch movement and exact SHA equality follows it; clean. |
| 2 | Official assets and tokens / Tasks 3-5 shells | Stable asset URLs and exact token values match all consumers; clean. |
| 2 | Asset verification / three build outputs | Build checks occur before shell changes; clean. |
| 3 | Intercomunica shell/classes / Task 7 visual review | Functional callbacks and routes are explicitly preserved; clean. |
| 3 | Shared-resource UI / approved portal styling | Runs after resource feature creates the named components; clean. |
| 4 | Prenotazioni shell/tokens / Task 7 | Existing class names and role navigation remain stable; clean. |
| 4 | React 19 app / future Lycoris guideline | No Lycoris dependency is introduced in this task; clean. |
| 5 | Orario Lycoris overrides / Task 7 | Existing wrappers and package stay intact; clean. |
| 5 | Semantic timetable colors / no product accents | Exception is limited to data/state meaning and documented; clean. |
| 6 | Local UI guides / future development | Same policy is stored in each independently deployed repo; clean. |
| 6 | Lycoris compatibility notes / current runtimes | Notes distinguish React 18 Intercomunica from React 19 apps; clean. |
| 7 | Automated and visual gates / Tasks 2-6 | Covers build, behavior, responsive layout and repository state; clean. |

## Task execution records

| Task | Status | Evidence / next condition |
|---|---|---|
| 1 — Orario pilot fast-forward | Complete | The router-boundary fix `d49a90050f6c8f3f071c2a4218039c2a7ae8d9b1` received independent PASS for the full suite, typecheck, lint, and build. `main` was fast-forwarded from `aba98905482c2117926fefe2d798482d65c9fed8` to that exact SHA. Post-merge `main...pilot` is `0 0`, tracked tree/staging are clean, and only the known untracked local files remain. See `task-1-report.md`. |
| 2 — Official assets and token contract | Complete | Intercomunica `475fd8c`, Prenotazioni `f35879a`, and Orario `5f6641d` add identical official local PNGs (full 900×392 and mark 256×256) and the approved institutional tokens. Orario review fix `a1f3789` corrects the page/focus/Lycoris mappings and excludes the nested pilot worktree from ESLint. Final Intercomunica typecheck/build, Prenotazioni typecheck/lint/build, and Orario typecheck/lint/build passed. See `task-2-report.md`. |
| 3 — Intercomunica portal alignment | Complete | Commits `053cf0e` and review fix `4848f77` align the shell, public login, Bacheca/resource/event cards, Admin Settings/resources editors, Calendar, Directory, controls, states, and compact layouts with the official Rainerum language. Final server tests passed 121/121, web tests 38/38, workspace typecheck/build and diff checks passed, and independent re-review returned PASS. Public login was inspected at 390×844 and 1440×900 with the correct compact/full marks and no horizontal overflow; private authenticated states are explicitly listed for Task 7. See `task-3-report.md`. |
