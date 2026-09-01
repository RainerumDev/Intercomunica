# Subgroup colors, ordering, and member modal

## Scope

Improve the existing “Gruppi & Docenti” flow without changing subgroup membership or email semantics:

- show each subgroup chip with a stable, readable color;
- let admins override the automatic subgroup color;
- sort subgroup chips by folder and subgroup name;
- let non-admin users inspect subgroup members and start an email from subgroup cards and chips.

The existing `CALENDAR_EXCLUDED_EMAILS` behavior is preserved. Excluded service accounts remain visible inside subgroups they already belong to.

## Data model and API

Add nullable `color String?` to Prisma `Subgroup` through an additive migration. `null` means automatic color. A stored value is an explicit uppercase `#RRGGBB` override.

The subgroup create/update request accepts `color` as nullable. Validation accepts only six-digit hexadecimal colors and normalizes valid values to uppercase. Creating a subgroup without a color stores `null`; selecting “Usa colore automatico” updates it back to `null`.

`GET /api/subgroups` returns `color`. `GET /api/users` includes `folder` and `color` in every subgroup associated with a teacher so the frontend can render and sort chips without joining data client-side. Existing authorization remains unchanged: everyone authenticated can read groups; only admins can mutate them.

## Deterministic color and contrast

A focused frontend utility derives chip presentation from subgroup name and optional override.

Automatic colors use a stable string hash mapped into HSL:

- hue spans the full 0–359° circle;
- saturation and lightness use bounded hash-derived bands that remain visually strong without becoming neon or muddy;
- the result is converted to an RGB/hex background;
- foreground is selected between a dark ink and white using relative luminance and WCAG contrast ratio, with pure black as a safe fallback for rare mid-tone overrides.

Manual `#RRGGBB` overrides use the same foreground-selection logic. The utility returns background, foreground, and border colors. It has no storage or browser dependency, making deterministic output and contrast directly testable. Renaming changes an automatic color but never a manual override.

## Ordering

Define one Italian-locale comparator for subgroups:

1. normalized folder name, alphabetically (`Generale` for an empty folder);
2. subgroup name, alphabetically;
3. subgroup ID as a deterministic tie-breaker.

Use it for:

- chips after each teacher name;
- subgroup cards inside each folder;
- admin subgroup pickers where applicable.

Member lists in the detail modal are sorted by display name, falling back to email, then by email as a tie-breaker. Sorting operates on copied arrays and does not mutate API state.

## User interface

### Chips

All subgroup chips use the computed background, foreground, and border colors.

For a non-admin user, a chip is a real button. Clicking it opens the subgroup detail modal. For an admin, the existing chip and remove action remain intact; the removal button does not accidentally open the detail modal.

### Subgroup cards

For a non-admin user, the card’s primary area is keyboard-accessible and opens the same detail modal. The separate email action is replaced by the modal action to avoid two competing click paths.

For an admin, edit, delete, and email behavior remains available. The existing edit modal gains:

- a native color input;
- an automatic-color preview;
- a “Usa colore automatico” control;
- save support for `color`.

New subgroups default to automatic color; no color control is added to the compact creation row.

### Subgroup detail modal

Create a reusable modal receiving one complete `Subgroup`. It shows:

- subgroup name and folder;
- colored subgroup chip;
- alphabetically sorted active members with name and email;
- an empty-state message when there are no members;
- “Invia email” when at least one member exists;
- close button, backdrop close, and Escape handling.

The email button closes the detail modal and opens the existing `EmailComposer` for that subgroup. No new email endpoint or recipient logic is introduced.

## Error handling and accessibility

Invalid color values are rejected by the existing request-validation path. API failures remain in the page-level error banner and do not discard the edit draft.

Clickable chips and cards use native buttons with visible focus styles and descriptive labels. The modal uses dialog semantics, an accessible title, Escape dismissal, and restores the normal page flow on close. Color is decorative: names and member counts remain textual, and foreground selection protects readability.

## Group-based access control

Login eligibility uses the membership state imported by the latest successful main-group synchronization:

- active users may log in;
- addresses in `ADMIN_EMAILS` bypass membership checks;
- addresses in `CALENDAR_EXCLUDED_EMAILS` bypass membership checks;
- every other missing or inactive user is rejected with a dedicated `login?error=group` redirect and a clear Italian message.

Regular login must no longer create arbitrary domain users. Bypass accounts may still be created or refreshed at login. No live Google membership request is made during OAuth, so authentication remains available when Google directory APIs are temporarily unavailable and its source of truth is explicit: the last completed synchronization.

Every authenticated request revalidates the session subject against the database. A regular user remains authorized only while `isActive` is true; bypass addresses remain authorized. Consequently, a group synchronization that deactivates a removed member invalidates that member’s existing session on the next page or API request, even though the signed cookie has not expired. Rejected cookies are cleared when practical and protected endpoints return `401`. The shared frontend API client broadcasts every `401` to the authentication provider, which clears its local user immediately and returns the interface to the login screen without requiring a manual reload.

## Verification

Add focused tests for:

- Prisma schema and SQL migration exposing `Subgroup.color`;
- color normalization and invalid-color rejection;
- deterministic automatic color and readable foreground for automatic and manual backgrounds;
- folder/name sorting without input mutation;
- `/api/users` subgroup payload including `folder` and `color`;
- modal member ordering through the pure sorter, plus frontend typecheck/build proof for the email-composer handoff without adding a DOM-test dependency;
- login acceptance for active members and both bypass lists;
- login rejection for missing/inactive regular users;
- immediate rejection of an existing session after its regular user becomes inactive.
- immediate frontend session clearing when any protected API request returns `401`.

Run the complete server tests, workspace typecheck, production build, and a focused UI inspection. Commit implementation separately from the already committed service-account exclusion work, then push both commits to the current `main` branch.
