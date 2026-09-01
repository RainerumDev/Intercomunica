# Task 2 report — Rainerum institutional assets and tokens

**Status:** complete for the scoped foundation changes.

## Deliverables

| Repository | Commit | Files |
| --- | --- | --- |
| Intercomunica | `475fd8c` | `web/public/rainerum-logo-full.png`, `web/public/rainerum-logo-mark.png`, `web/src/index.css` |
| Prenotazioni | `f35879a` | `public/rainerum-logo-full.png`, `public/rainerum-logo-mark.png`, `src/app/globals.css` |
| Orario | `5f6641d` | `public/rainerum-logo-full.png`, `public/rainerum-logo-mark.png`, `src/app/globals.css`, `src/app/lyco-ui.css` |

The local full mark is a transparent RGBA PNG at 900×392 and the compact mark is a transparent RGBA PNG at 256×256 in each app. Their SHA-256 values match across all three copies: `8d8d35da50cd0c7001cffedb591310ed91800b3bb636602d1ff959172e4db2eb` (full) and `62b9b468cec8cf94c733ec7ed941ccafc5b089c129e637ed89cc41f7408c945e` (compact).

Each styling system now defines the shared contract: brand `#b8181b`, hover `#8f1114`, ink `#261816`, muted `#6a5552`, page `#fff8f7`, surface `#ffffff`, soft surface `#fff0ee`, line `#dbbeba`, and focus `#004075`, plus strong-border, semantic status, radius, and shadow tokens. Intercomunica’s FullCalendar variables and Orario’s Lycoris override variables resolve through the shared contract. Existing semantic status colors remain distinct.

## Verification

| Repository | Gates |
| --- | --- |
| Intercomunica | `npm run build` before and after changes; final `npm run typecheck`; static token assertions; `file` and `sips` asset inspection; Vite output contains both local assets. All passed. |
| Prenotazioni | `pnpm build` before and after changes; final `pnpm typecheck` and `pnpm lint`; static token assertions; `file` and `sips` asset inspection. All passed. |
| Orario | `npm run build` before and after changes; final `npm run typecheck`; static token assertions; `file` and `sips` asset inspection. All passed. `npm run lint` is not a task-code failure: it recursively lints generated files in the nested `.worktrees/pilot-foundation` checkout and reports 328 pre-existing rule-resolution/generated-artifact errors. |

No behavior tests were added or changed because this task only creates static assets and CSS-token mappings; the focused static assertions and production builds cover the deliverable. Orario needed `npm ci` to restore its missing lockfile-defined local dependencies; `package-lock.json` was unchanged. Prenotazioni's existing untracked `.DS_Store` and `mockups/`, and Orario's existing untracked `.DS_Store`, were preserved.
