ALTER TABLE "User"
  ADD COLUMN "calendarFeedTokenHash" TEXT,
  ADD COLUMN "calendarFeedTokenEnc" TEXT,
  ADD COLUMN "calendarFeedTokenIssuedAt" TIMESTAMP(3),
  ADD COLUMN "calendarFeedLastFetchedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_calendarFeedTokenHash_key" ON "User"("calendarFeedTokenHash");
