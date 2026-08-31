ALTER TABLE "AppConfig"
  ADD COLUMN "generalCalendarId" TEXT,
  ADD COLUMN "generalCalendarSyncToken" TEXT,
  ADD COLUMN "generalCalendarChannelId" TEXT,
  ADD COLUMN "generalCalendarResourceId" TEXT,
  ADD COLUMN "generalCalendarChannelToken" TEXT,
  ADD COLUMN "generalCalendarChannelExpiresAt" TIMESTAMP(3),
  ADD COLUMN "generalCalendarLastSyncAt" TIMESTAMP(3),
  ADD COLUMN "generalCalendarLastError" TEXT;

ALTER TABLE "Event"
  ADD COLUMN "generalGoogleEventId" TEXT,
  ADD COLUMN "googleOccurrenceKey" TEXT;

CREATE UNIQUE INDEX "Event_generalGoogleEventId_key" ON "Event"("generalGoogleEventId");
