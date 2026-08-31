# General Calendar Synchronization Design

## Goal

Connect one Google Calendar as Intercomunica's general calendar, keep it bidirectionally synchronized with the application, and propagate eligible events to teacher calendars without exceeding practical API limits.

## Event distribution rules

- Every Intercomunica event exists in the configured general Google Calendar.
- `bachecaOnly=true`: visible on the bacheca and general calendar only.
- `isGlobal=true`: copied to every active teacher calendar.
- Otherwise: copied only to active teachers belonging to selected subgroups.
- An event created directly in the general calendar is imported as global and copied to all active teacher calendars.
- Recurring Google events are expanded and imported as independently editable occurrences.

## Synchronization architecture

The server owns a single idempotent general-calendar synchronization service. The service is invoked by an administrator, by Google push notifications, and by a 15-minute safety poll. Push channels are renewed before expiry and recreated on application startup when needed.

The first import requests events from 30 days before synchronization time onward, expands recurring events with `singleEvents=true`, and stores Google's `nextSyncToken`. Later imports use only that token. A `410 Gone` response clears the stale token and repeats the bounded initial import.

Google push notifications contain no event body. The webhook validates the configured channel ID, resource ID, and secret token, acknowledges immediately, and schedules the same incremental synchronization pipeline. Concurrent requests are collapsed into one in-process job because the production deployment runs one application replica.

## Persistence

`AppConfig` stores the general calendar ID, incremental sync token, webhook channel identifiers, secret, expiry, last synchronization timestamp, and last synchronization error.

`Event` stores the corresponding general Google event ID and recurrence occurrence key. A unique general Google event ID prevents duplicate imports. Teacher copies remain represented by `EventInstance`.

## Bidirectional behavior

Application creates and updates write the database first, then upsert the general copy and reconcile teacher copies. Application deletion removes teacher copies and the general copy before deleting the database row.

Google changes are converted to the Intercomunica event model. Existing linked events are updated and redistributed; unknown events are created as global. Google cancellations delete teacher copies and the database event. Application-originated webhook echoes are harmless because lookup and updates are idempotent.

If an external Google event contains unsupported recurrence metadata, each expanded occurrence is handled as an ordinary event. Intercomunica edits that occurrence rather than the recurrence series.

## API safety

Teacher propagation is sequential and uses the existing exponential retry wrapper. Restricting the first import avoids approximately 49,500 writes for 1,100 historical events across 45 teachers. Incremental sync processes only changed records, while the 15-minute poll protects against missed push notifications.

## Administration UI

Settings expose the general calendar ID, connection state, last sync, last error, webhook expiry, a save button, and a manual general-calendar synchronization action. Saving a different calendar clears previous synchronization and channel state.

The public webhook URL is derived from `BASE_URL`; HTTPS termination may remain in Nginx Proxy Manager.

## Event modal fixes

- Commit a pending tag on blur and include it synchronously when Save is clicked.
- Render date-only controls for all-day events and preserve Google Calendar's exclusive end-date convention.
- Group recipient subgroups by their `folder`, with an “Altri” section for missing folders.
- Close event details and edit/create modals with Escape when no save/delete operation is running.

## Failure behavior

Google failures are recorded in synchronization state and logs without corrupting event links. Missing calendars or events are recreated where safe. Invalid or inaccessible general calendar configuration is surfaced to the administrator. Webhook requests never require an Intercomunica login, but must match the unguessable stored channel token and identifiers.
