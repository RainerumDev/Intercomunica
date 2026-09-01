# Server-managed personal ICS migration

## Objective

Replace every Google calendar created by Intercomunica for an individual teacher with a personalized, read-only iCalendar feed served directly by Intercomunica. The existing general Google Calendar remains the shared calendar everyone already uses and remains the source synchronized with Intercomunica.

The migration is intentionally decisive:

- the deployed application immediately stops creating or updating individual Google calendars;
- the next teacher synchronization attempts to delete every legacy individual Google calendar recorded in `User.calendarId`;
- failed deletions remain pending and are retried by later synchronizations;
- the Bacheca always offers two independent resources: the existing general Google Calendar and the signed-in user's personal ICS feed.

This change does not migrate the general calendar away from Google and does not change which events are stored in it or who can see it.

## Chosen architecture

Use one dynamic feed per eligible user. Every request renders a complete iCalendar document from current database state. Do not pre-generate files and do not create separate feeds per subgroup.

The dynamic feed is the smallest reliable source of truth because membership and event edits are applied at read time. It needs no regeneration queue, cannot leave stale files on disk, and gives each user one subscription even when they belong to several subgroups.

## Legacy Google calendar retirement

### Stop personal propagation immediately

After deployment, event create, update, and delete operations interact only with the configured general Google Calendar. They no longer:

- look up personal target users;
- insert, update, or delete per-user Google event copies;
- create `EventInstance` records;
- reconcile per-user Google event copies.

Imports and push synchronization for the general Google Calendar continue unchanged. Database events remain the source used by Bacheca, the in-app calendar, and personal ICS feeds.

### Delete whole calendars during synchronization

After main-group membership alignment, synchronization loads every user whose `calendarId` is non-null, including inactive users and addresses now excluded from personal calendars. For each legacy calendar it calls Google Calendar's whole-calendar deletion operation using the connected master account.

Deletion is idempotent:

- Google `404` or `410` means the calendar is already absent and cleanup may continue;
- after confirmed or already-complete deletion, delete that user's `EventInstance` rows and set `calendarId` and `calendarName` to null in one database transaction;
- after any other failure, retain all local references so a later synchronization can retry;
- apply the existing retry/backoff policy and a delay between calendar mutations;
- an operational usage-limit response stops further calendar deletions for that run without undoing completed work.

The synchronization result and history replace the old created/renamed/reinjected counters with:

- `calendarsRemoved`;
- `calendarsPending`;
- `errors`.

The user-facing Settings copy explains that synchronization imports group membership and removes remaining legacy personal calendars. Calendar-name configuration and controls are removed because new individual Google calendars can no longer be created.

### Transitional schema

Keep `User.calendarId`, `User.calendarName`, and `EventInstance` temporarily. They are required to identify and clean up legacy Google resources safely. They become read-only migration state and are never populated again.

A later cleanup migration may drop those fields and the `EventInstance` table only after production data proves every `calendarId` is null. That later removal is explicitly outside this delivery.

## Personal feed identity and security

### URL format

The public subscription URL is:

```text
https://intercomunica.rainerum.delugan.net/calendar/feed/<local-part>-<secret>.ics
```

For `kevin.delugan@rainerum.it`, an example shape is:

```text
https://intercomunica.rainerum.delugan.net/calendar/feed/kevin.delugan-Qf8...random...k2.ics
```

The local part is normalized to lowercase and restricted to URL-safe letters, digits, dot, underscore, and hyphen. Unsupported characters become hyphens. The prefix is descriptive only and is never trusted to identify the user.

Including the local part deliberately exposes that portion of the institutional address to anyone who receives the link. This is an accepted product requirement; the secret still prevents discovery of the feed contents.

The secret contains at least 256 bits from a cryptographically secure random generator and is base64url encoded. The entire path token, excluding `.ics`, is SHA-256 hashed for indexed feed lookup. To show the same stable URL again to its owner, the secret is also stored encrypted with the application's existing encryption key. Plain token values are never stored.

Add nullable user fields for:

- unique token hash;
- encrypted token secret;
- token issue time;
- most recent successful fetch time.

The token is created lazily when an eligible signed-in user first requests calendar links. An authenticated rotation action replaces the hash and encrypted secret atomically; the old URL immediately stops working.

### Feed authorization

The feed endpoint cannot require the Intercomunica session cookie because Google, Apple, or Microsoft fetch it server-to-server. The unguessable URL is a bearer credential.

On every request the endpoint:

1. hashes the supplied token and performs an exact indexed lookup;
2. verifies that the user remains authorized for the application;
3. verifies that the address is not in `CALENDAR_EXCLUDED_EMAILS`;
4. returns `404` for an unknown token and `410` for a known but no-longer-eligible subscription;
5. updates last-fetch telemetry without putting the token in application logs.

Removing a regular user from the synchronized main group therefore revokes future feed reads immediately. Administrators retain their existing access bypass, while calendar-excluded service accounts remain intentionally ineligible for a personal feed.

Deployment configuration must suppress or redact request paths under `/calendar/feed/` in reverse-proxy access logs. Error messages and analytics must never contain a feed URL or token.

## ICS content

The public route is registered before the production SPA fallback:

```text
GET /calendar/feed/:token.ics
```

It returns `text/calendar; charset=utf-8` and a complete RFC 5545-compatible `VCALENDAR`. Use a maintained iCalendar serializer rather than hand-building escaping, line folding, and date syntax.

The feed includes events where:

- `bachecaOnly` is false; and
- `isGlobal` is true, or the event belongs to one of the user's current subgroups.

This mirrors the former personal Google calendar behavior. The general Google Calendar remains broader and unchanged.

Each `VEVENT` includes:

- stable `UID` based on the Intercomunica event ID and application domain;
- `DTSTAMP` and `LAST-MODIFIED`;
- summary, description, and location with standards-compliant escaping;
- UTC date-times for timed events;
- date-only, exclusive-end values for all-day events.

The calendar includes a stable product identifier, display name, source URL, and a suggested refresh interval. Client applications remain free to choose their actual refresh frequency.

The response computes a strong content `ETag` and sends `Cache-Control: private, no-cache`. A matching `If-None-Match` returns `304` with no body. Successful full responses update the user's last-fetch time. The initial implementation returns all matching database events so clients receive a complete authoritative snapshot; range trimming is deferred unless measured feed size requires it.

## Calendar links API and Bacheca

### Authenticated links API

Add an authenticated endpoint returning:

```json
{
  "generalGoogleUrl": "https://calendar.google.com/calendar/embed?src=...&ctz=Europe%2FRome",
  "personalIcsUrl": "https://intercomunica.rainerum.delugan.net/calendar/feed/...ics",
  "personalWebcalUrl": "webcal://intercomunica.rainerum.delugan.net/calendar/feed/...ics",
  "personalFeedEligible": true,
  "lastFetchedAt": null
}
```

`generalGoogleUrl` is constructed from the `generalCalendarId` already configured in Settings and always points to Google Calendar, never to an Intercomunica representation. If no general calendar is configured, the response returns null for that URL and the corresponding Bacheca action is disabled with explanatory text.

`personalIcsUrl` uses the existing `BASE_URL` public backend origin and is created only for eligible accounts. Do not hard-code the hostname in application logic; production configuration must set `BASE_URL=https://intercomunica.rainerum.delugan.net`.

Add an authenticated token-rotation endpoint. Rotation requires an explicit confirmation in the UI because every previously configured client will stop updating.

### Bacheca resource panel

Add a resource panel near the top of Bacheca, visible independently of whether there are upcoming event sections. It contains two equally weighted actions, following the visual language of other resource cards:

1. **Collega calendario generale** — opens the Google-hosted general-calendar URL in a new tab.
2. **Collega il mio calendario** — opens a small instruction dialog for the personal subscription.

The personal dialog shows:

- `Apri nell'app Calendario`, using `webcal://`;
- `Copia indirizzo HTTPS`, for Google Calendar's “Da URL” workflow and clients that do not handle `webcal://`;
- concise Google Calendar, Apple Calendar, and Outlook instructions;
- whether the feed has ever been fetched;
- `Rigenera collegamento`, with destructive confirmation.

Do not link directly to the HTTPS feed as a normal download action: importing a downloaded `.ics` file creates a static copy rather than a subscription and would not receive later updates.

## API and data-flow changes

The event service becomes simpler:

- application writes persist the database event and maintain its general Google copy;
- general-calendar imports call the same database operations with general-copy writes skipped;
- no operation fans out to teachers;
- event deletion removes the general Google copy, then deletes the database event;
- Bacheca, in-app calendar, and ICS all read visibility from database subgroup relations.

The normal `/api/events` behavior remains unchanged for this delivery. The new feed applies personal visibility explicitly and does not reuse the broad administrative calendar query.

The general-calendar webhook, incremental sync token, watch renewal, and manual general-calendar sync are unaffected.

## Failure handling and observability

- A feed database failure returns `503`, never an empty valid calendar, so clients do not interpret an outage as deletion of every event.
- Unknown tokens return a generic `404`; logs contain only status and a non-secret request correlation ID.
- Inactive or excluded known subscriptions return `410` without disclosing the associated email.
- Google cleanup errors appear in the existing synchronization result and `SyncLog`.
- Settings shows remaining legacy calendars so administrators know whether cleanup is complete.
- Feed metrics aggregate successful fetches, `304`, `404`, `410`, and generation failures without recording token paths or email addresses.

## Migration and rollout

1. Apply the additive token-field migration.
2. Deploy code that stops all personal Google fan-out before any synchronization runs.
3. Keep the general Google Calendar integration active.
4. Run the next teacher synchronization; it attempts legacy calendar deletion and reports completed and pending counts.
5. Teachers may use either Bacheca button immediately; personal tokens are created on demand.
6. Repeat synchronization until `calendarsPending` is zero.
7. After an operational observation period, separately remove the obsolete schema and Google personal-calendar code.

There is no automatic fallback that recreates Google personal calendars. Rolling the application code back after calendars have been deleted cannot restore those calendars without creating new resources and reinjecting events; the deployment must therefore take a database backup and record the pre-migration calendar IDs before the first destructive synchronization.

## Verification

Add automated coverage for:

- URL-safe token shape with the email local-part prefix;
- cryptographic randomness, encrypted persistence, hash lookup, stable redisplay, and rotation invalidation;
- active, admin-bypass, inactive, and calendar-excluded feed eligibility;
- personalized event visibility, global events, subgroup changes, and `bachecaOnly` exclusion;
- RFC-compliant timed and all-day serialization, stable UIDs, escaping, and update metadata;
- `ETag` and `304` behavior;
- generic `404`, revoked `410`, and database-failure `503` responses;
- links API construction from configured general calendar ID and public origin;
- whole-calendar deletion success, already-absent handling, partial failure preservation, operational-limit stop, and later retry;
- proof that event create/update/delete no longer make per-user Google calls;
- Bacheca rendering, disabled general-calendar state, personal dialog, copy/open actions, and token-rotation confirmation;
- full server/web tests, typecheck, production build, migration generation/status, and focused browser verification.

The destructive synchronization must be tested with mocked Google responses before it is allowed to run against a real connected account.
