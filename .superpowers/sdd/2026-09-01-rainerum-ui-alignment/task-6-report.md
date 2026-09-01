# Task 6 report — durable Lycoris-first UI guidelines

**Status:** complete for the approved documentation-only scope.

## Deliverables

- Intercomunica: `c76f13cf68704d740ac7555d4c600ed54e68f660` (`docs(ui): add Lycoris-first Rainerum guidelines`), based on `c82de5dfeaad18f8eacb3743369da37f223c66e9`.
- Prenotazioni: `116ecf0cfa018bc06eeee8b756d8051e48f6fea7` (`docs(ui): add Lycoris-first Rainerum guidelines`), based on `b58f7ffce8d5fe16937ad7467babc30405c8cba1`.
- Orario: `b1d92ac86ed28898a1c6821acfd079a6147e7847` (`docs(ui): add Lycoris-first Rainerum guidelines`), based on `afeefc9bea171bf8797846b4d9ceea8939d0ab12`.

Each independently deployed repository now has `docs/ui-guidelines.md`, linked prominently from its README. The guides make the local official full/compact marks and Rainerum token mapping the baseline; reserve institutional red for the product accent; and explicitly retain semantic status and data-encoding colours as meaning-bearing exceptions.

## Token-name correction

The token list in all three guides now names the existing canonical hover token `--brand-hover: #8f1114`, replacing the stale `--brand-strong` claim. Prenotazioni and Orario retain their already-existing local `--brand-dark: var(--brand-hover)` aliases; those aliases were not renamed or changed. No application CSS, component, dependency, or behavior changed.

- Intercomunica follow-up: `5087456910a2dd3749899765147607f8a6375e34`, based on `ccb2144fe78caf651b9fab9f1c835810bf8e5f9d`.
- Prenotazioni follow-up: `6044e964308d8e97d95a4e224f03cbd2771e21f1`, based on `116ecf0cfa018bc06eeee8b756d8051e48f6fea7`.
- Orario follow-up: `dad8f99809d33745e471848d17943b6b17471223`, based on `b1d92ac86ed28898a1c6821acfd079a6147e7847`.

The scoped packages `task-6-token-polish-intercomunica-ccb2144..5087456.diff` (13 lines, 1,613 bytes), `task-6-token-polish-prenotazioni-116ecf0..6044e96.diff` (13 lines, 1,569 bytes), and `task-6-token-polish-orario-b1d92ac..dad8f99.diff` (13 lines, 1,637 bytes) are byte-for-byte equal to their committed diffs. Each reverse-applies cleanly and its `git diff --check` passes.

They make Lycoris the default for new compatible components and surfaces, require a pinned approved version, one root stylesheet import, thin framework-routing adapters, and reuse of current/vendored components rather than forks or copies. The practical checklist covers component selection, runtime/peer/registry/build/deploy compatibility, responsive layout, semantic HTML, keyboard focus, contrast, screen-reader labels, and behavior-preserving gates.

## Compatibility evidence

The [official Lycoris introduction](https://ui.lycoris.it/docs/introduction) and [installation guide](https://ui.lycoris.it/docs/installation) were checked on 2026-09-01. They specify GitHub Packages under `@loreschaeffer`, root stylesheet import, Node.js `>=25`, npm `>=10`, and React-target peers `react`/`react-dom` `^19.0.0` (with `shiki` `^4.0.0` only for `Code`). The current Orario-vendored `@loreschaeffer/lyco-ui` README/package metadata confirms version 1.1.2, the same React peers, the GitHub Packages registry, the `read:packages` requirement, and its `style.css` export.

- Intercomunica remains React 18.3: it keeps its existing stack and tokens. A future Lycoris React-target adoption needs a dedicated React/React DOM migration plus Node/npm, peer, routing, calendar/dialog, accessibility, build and deployment proof.
- Prenotazioni is React 19 but does not yet use Lycoris. Adoption is explicitly deferred until the dedicated compatibility check passes; no dependency was added.
- Orario retains its vendored Lycoris 1.1.2 archive, root stylesheet import, `src/app/lyco-ui.css` overrides and `src/ui/primitives/` wrappers. No package, runtime or dependency update was made.

## Exact packages and verification

| Repository | Exact diff package | Validation |
| --- | --- | --- |
| Intercomunica | `task-6-intercomunica-c82de5d..c76f13c.diff` (60 lines, 5,637 bytes) | `git diff --check c82de5d..c76f13c` and reverse-apply check passed. |
| Prenotazioni | `task-6-prenotazioni-b58f7ff..116ecf0.diff` (56 lines, 5,356 bytes) | `git diff --check b58f7ff..116ecf0` and reverse-apply check passed. |
| Orario | `task-6-orario-afeefc9..b1d92ac.diff` (56 lines, 5,334 bytes) | `git diff --check afeefc9..b1d92ac` and reverse-apply check passed. |

All three guides passed static path/content checks: README links resolve to the local guide, the referenced logo assets exist, and each guide contains the required token, compatibility, accessibility and checklist policy. This task changes documentation only; no application code, dependencies, deployment configuration or production state changed.

## Record correction

While recording Task 6, `task-4-report.md` was corrected: its final calendar evidence is the independently verified PNG at the documented path; the superseded JPEG stream is not an accepted evidence artifact.
