# Calendar Subscription and Audience Selection Design

## Goal

Make calendar subscription understandable and recoverable across browsers, using the same Google Calendar interaction as Orario, and make `Tutti` and subgroup selection mutually exclusive in both event creation and editing.

## Scope and compatibility

- The existing tokenized HTTPS calendar feed remains canonical and unchanged.
- No database migration, API contract change, dependency upgrade, authentication change, or production deployment is part of this work.
- Existing event persistence, visibility rules, feed rotation, calendar downloads, and board behavior remain unchanged except for the audience interaction specified below.
- The UI must not log, persist in browser storage, or send the tokenized feed URL anywhere except when the user explicitly activates an external calendar action.

## Calendar subscription interaction

Calendar resources adopt the same interaction contract as Orario.

For each distinct feed URL, the first activation of `AGGIUNGI A GOOGLE CALENDAR` opens a new tab at:

`https://calendar.google.com/calendar/r?cid=<percent-encoded HTTPS feed URL>`

The second and every later activation for that same feed during the current page lifetime:

1. attempts to copy the canonical HTTPS feed URL;
2. opens an accessible dialog explaining `Altri calendari → + → Da URL`;
3. links to `https://calendar.google.com/calendar/u/0/r/settings/addbyurl`;
4. shows the HTTPS URL in a selectable control, whether or not clipboard access succeeds;
5. ends with `Prova con un'altra app calendario`, using the equivalent `webcal://` URL.

The click state is in-memory, scoped per feed, and resets on page reload. Clipboard rejection is an expected state and must not prevent the dialog from opening. Existing copy and download capabilities remain available. The current generic `Apri nell'app calendario` action becomes the explicit secondary `webcal://` fallback rather than the only primary action.

The `cid` integration is best-effort because Google does not document it as a stable API. The manual HTTPS path is always visible as the reliable fallback. External links open safely with `noopener`/`noreferrer` behavior.

## Event audience interaction

`Tutti` and subgroup selections form one mutually exclusive choice model in the shared create/edit event modal.

- Selecting a subgroup while `Tutti` is active atomically sets `isGlobal` to false and retains the clicked subgroup selection.
- Selecting or deselecting additional subgroups while in targeted mode preserves the other selected subgroup IDs.
- Selecting `Tutti` while one or more subgroups are selected atomically sets `isGlobal` to true and clears every subgroup ID.
- Clearing `Tutti` with no subgroup selected produces the existing invalid targeted state; the current validation prevents saving until the user chooses an audience.
- `bachecaOnly` and all unrelated event fields are unchanged.

The same component and state transition functions serve both event creation and editing, so there is only one behavior contract.

## Error handling and accessibility

- The calendar dialog has an accessible name, focus management, Escape/close behavior, and a live status for clipboard success or failure.
- The canonical HTTPS URL is selectable even when clipboard permissions are unavailable.
- Audience controls expose checked state correctly and never leave hidden subgroup selections behind `Tutti`.
- A failed external navigation does not mutate feed or event state.

## Verification

Development follows test-first red/green cycles. Coverage must include:

- exact percent-encoded Google URL and first-click navigation;
- second-click dialog, clipboard success and rejection, manual Google settings link, selectable HTTPS URL, `webcal://` fallback, reset-on-reload semantics, and independent state for distinct feeds;
- subgroup click while global, multiple subgroup toggles, `Tutti` click while targeted, validation with no audience, and submitted create/edit payloads;
- preservation of `bachecaOnly` and unrelated form fields.

Run focused component tests after each slice, then the complete server and web test suites, typechecks, production builds, and relevant browser tests. Do not deploy or push as part of implementation.
