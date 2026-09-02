-- CreateTable
CREATE TABLE "SharedResource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "previewEnabled" BOOLEAN NOT NULL DEFAULT true,
    "previewImageUrl" TEXT,
    "previewSiteName" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "previewFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedResourceSubgroup" (
    "resourceId" TEXT NOT NULL,
    "subgroupId" TEXT NOT NULL,

    CONSTRAINT "SharedResourceSubgroup_pkey" PRIMARY KEY ("resourceId", "subgroupId")
);

-- CreateIndex
CREATE INDEX "SharedResource_sortOrder_idx" ON "SharedResource"("sortOrder");

-- CreateIndex
CREATE INDEX "SharedResourceSubgroup_subgroupId_idx" ON "SharedResourceSubgroup"("subgroupId");

-- AddForeignKey
ALTER TABLE "SharedResourceSubgroup" ADD CONSTRAINT "SharedResourceSubgroup_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "SharedResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedResourceSubgroup" ADD CONSTRAINT "SharedResourceSubgroup_subgroupId_fkey" FOREIGN KEY ("subgroupId") REFERENCES "Subgroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
