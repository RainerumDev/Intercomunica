import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteSubgroupPreservingResourceAudiences, SubgroupResourceAudienceConflictError } from "../routes/subgroups.js";
import {
  createPrismaSharedResourceRepository,
  createSharedResourceService,
  type SharedResourceInput,
} from "./sharedResourceService.js";

const DATABASE_URL = process.env.INTERCOMUNICA_INTEGRATION_DATABASE_URL
  ?? "postgresql://intercomunica:intercomunica@localhost:5432/intercomunica?schema=public";

type Outcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

function tracked<T>(promise: Promise<T>): Promise<Outcome<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason: unknown) => ({ status: "rejected", reason })
  );
}

function clientUrl(applicationName: string): string {
  const url = new URL(DATABASE_URL);
  url.searchParams.set("application_name", applicationName);
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

function client(applicationName: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: clientUrl(applicationName) });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, label: string, timeoutMs = 2500): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out while ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function teardownError(label: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`${label}: ${detail}`, { cause });
}

async function captureFailure(
  failures: unknown[],
  label: string,
  operation: Promise<unknown> | undefined
): Promise<void> {
  if (!operation) return;
  try {
    await bounded(operation, label);
  } catch (error) {
    failures.push(teardownError(label, error));
  }
}

async function finishConcurrencyTest({
  primaryError,
  release,
  operations,
  blocker,
  observer,
  resourceUrl,
  subgroupIds,
  clients,
}: {
  primaryError: unknown;
  release: () => void;
  operations: Promise<unknown>[];
  blocker: Promise<void> | undefined;
  observer: PrismaClient;
  resourceUrl: string;
  subgroupIds: string[];
  clients: PrismaClient[];
}): Promise<void> {
  const failures: unknown[] = primaryError === undefined ? [] : [primaryError];
  release();

  await captureFailure(failures, "settling concurrent operations", Promise.all(operations));
  await captureFailure(failures, "settling blocker transaction", blocker);
  await captureFailure(
    failures,
    "deleting concurrency resource fixtures",
    observer.sharedResource.deleteMany({ where: { url: resourceUrl } })
  );
  await captureFailure(
    failures,
    "deleting concurrency subgroup fixtures",
    observer.subgroup.deleteMany({ where: { id: { in: subgroupIds } } })
  );
  await captureFailure(
    failures,
    "verifying concurrency fixture cleanup",
    Promise.all([
      observer.sharedResource.count({ where: { url: resourceUrl } }),
      observer.subgroup.count({ where: { id: { in: subgroupIds } } }),
    ]).then(([resourceCount, subgroupCount]) => {
      if (resourceCount !== 0 || subgroupCount !== 0) {
        throw new Error(`fixtures remain (resources=${resourceCount}, subgroups=${subgroupCount})`);
      }
    })
  );
  await Promise.all(clients.map((value, index) =>
    captureFailure(failures, `disconnecting test client ${index + 1}`, value.$disconnect())
  ));

  if (failures.length > 0) {
    throw new AggregateError(failures, "Concurrency test or teardown failed");
  }
}

async function waitForBlockedClients(
  observer: PrismaClient,
  applicationNames: string[],
  timeoutMs = 3000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const activities = await observer.$queryRaw<Array<{
      application_name: string;
      wait_event_type: string | null;
    }>>`
      SELECT application_name, wait_event_type
      FROM pg_stat_activity
      WHERE application_name IN (${Prisma.join(applicationNames)})
    `;
    if (applicationNames.every((name) => activities.some(
      (activity) => activity.application_name === name && activity.wait_event_type === "Lock"
    ))) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for blocked clients: ${applicationNames.join(", ")}`);
}

function input(url: string, subgroupIds: string[]): SharedResourceInput {
  return {
    url,
    title: "Concurrency resource",
    description: null,
    previewEnabled: false,
    previewImageUrl: null,
    previewSiteName: null,
    isGlobal: false,
    subgroupIds,
  };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

describe("shared-resource audience concurrency", () => {
  const prerequisite = client("intercomunica-concurrency-prerequisite");

  beforeAll(async () => {
    await prerequisite.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prerequisite.$disconnect();
  });

  it("never commits an audience-less resource when create races subgroup deletion", async () => {
    const token = Math.random().toString(16).slice(2, 10);
    const suffix = `create-${Date.now()}-${token}`;
    const createApplication = `ic-${token}-create`;
    const deleteApplication = `ic-${token}-delete`;
    const subgroupId = `${suffix}-group`;
    const resourceUrl = `https://example.org/${suffix}`;
    const observer = client(`ic-${token}-observer`);
    const blockerClient = client(`ic-${token}-blocker`);
    const createClient = client(createApplication);
    const deleteClient = client(deleteApplication);
    const release = deferred();
    let blocker: Promise<void> | undefined;
    const operations: Promise<unknown>[] = [];
    let primaryError: unknown;

    try {
      await observer.subgroup.create({ data: { id: subgroupId, name: subgroupId } });
      const blockerReady = deferred();
      blocker = blockerClient.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "Subgroup" WHERE id = ${subgroupId} FOR UPDATE`;
        blockerReady.resolve();
        await release.promise;
      });
      await blockerReady.promise;

      const service = createSharedResourceService(createPrismaSharedResourceRepository(createClient));
      const createOutcome = tracked(service.createResource(input(resourceUrl, [subgroupId])));
      const deleteOutcome = tracked(deleteSubgroupPreservingResourceAudiences(subgroupId, deleteClient));
      operations.push(createOutcome, deleteOutcome);

      await waitForBlockedClients(observer, [
        createApplication,
        deleteApplication,
      ]);
      release.resolve();
      await blocker;

      const [created, deleted] = await Promise.all([createOutcome, deleteOutcome]);
      const rejected = [created, deleted].filter((outcome) => outcome.status === "rejected");
      expect(rejected).toHaveLength(1);
      if (created.status === "rejected") {
        expect(isPrismaCode(created.reason, "P2003")).toBe(true);
        expect(deleted.status).toBe("fulfilled");
      } else {
        expect(deleted.status).toBe("rejected");
        if (deleted.status === "rejected") {
          expect(deleted.reason).toBeInstanceOf(SubgroupResourceAudienceConflictError);
        }
      }

      const audienceLess = await observer.sharedResource.findMany({
        where: { url: resourceUrl, isGlobal: false, subgroups: { none: {} } },
      });
      expect(audienceLess).toEqual([]);
    } catch (error) {
      primaryError = error;
    } finally {
      await finishConcurrencyTest({
        primaryError,
        release: release.resolve,
        operations,
        blocker,
        observer,
        resourceUrl,
        subgroupIds: [subgroupId],
        clients: [observer, blockerClient, createClient, deleteClient],
      });
    }
  }, 10_000);

  it("allows one of two simultaneous subgroup deletes and rejects the other after retry", async () => {
    const token = Math.random().toString(16).slice(2, 10);
    const suffix = `delete-${Date.now()}-${token}`;
    const firstApplication = `ic-${token}-first`;
    const secondApplication = `ic-${token}-second`;
    const firstGroupId = `${suffix}-g1`;
    const secondGroupId = `${suffix}-g2`;
    const resourceUrl = `https://example.org/${suffix}`;
    const observer = client(`ic-${token}-observer`);
    const blockerClient = client(`ic-${token}-blocker`);
    const firstDeleteClient = client(firstApplication);
    const secondDeleteClient = client(secondApplication);
    const release = deferred();
    let blocker: Promise<void> | undefined;
    const operations: Promise<unknown>[] = [];
    let primaryError: unknown;

    try {
      await observer.subgroup.createMany({
        data: [
          { id: firstGroupId, name: firstGroupId },
          { id: secondGroupId, name: secondGroupId },
        ],
      });
      await observer.sharedResource.create({
        data: {
          url: resourceUrl,
          title: "Two audiences",
          previewEnabled: false,
          isGlobal: false,
          sortOrder: 0,
          subgroups: {
            create: [
              { subgroupId: firstGroupId },
              { subgroupId: secondGroupId },
            ],
          },
        },
      });

      const blockerReady = deferred();
      blocker = blockerClient.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM "Subgroup"
          WHERE id IN (${Prisma.join([firstGroupId, secondGroupId])})
          FOR UPDATE
        `;
        blockerReady.resolve();
        await release.promise;
      });
      await blockerReady.promise;

      const firstOutcome = tracked(
        deleteSubgroupPreservingResourceAudiences(firstGroupId, firstDeleteClient)
      );
      const secondOutcome = tracked(
        deleteSubgroupPreservingResourceAudiences(secondGroupId, secondDeleteClient)
      );
      operations.push(firstOutcome, secondOutcome);
      await waitForBlockedClients(observer, [
        firstApplication,
        secondApplication,
      ]);
      release.resolve();
      await blocker;

      const outcomes = await Promise.all([firstOutcome, secondOutcome]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const conflict = outcomes.find((outcome) => outcome.status === "rejected");
      expect(conflict?.status).toBe("rejected");
      if (conflict?.status === "rejected") {
        expect(conflict.reason).toBeInstanceOf(SubgroupResourceAudienceConflictError);
      }

      const persisted = await observer.sharedResource.findFirstOrThrow({
        where: { url: resourceUrl },
        include: { subgroups: true },
      });
      expect(persisted.subgroups).toHaveLength(1);
    } catch (error) {
      primaryError = error;
    } finally {
      await finishConcurrencyTest({
        primaryError,
        release: release.resolve,
        operations,
        blocker,
        observer,
        resourceUrl,
        subgroupIds: [firstGroupId, secondGroupId],
        clients: [observer, blockerClient, firstDeleteClient, secondDeleteClient],
      });
    }
  }, 10_000);

  it("never commits an audience-less resource when an audience update races subgroup deletion", async () => {
    const token = Math.random().toString(16).slice(2, 10);
    const suffix = `update-${Date.now()}-${token}`;
    const updateApplication = `ic-${token}-update`;
    const deleteApplication = `ic-${token}-delete`;
    const oldGroupId = `${suffix}-old`;
    const newGroupId = `${suffix}-new`;
    const resourceUrl = `https://example.org/${suffix}`;
    const observer = client(`ic-${token}-observer`);
    const blockerClient = client(`ic-${token}-blocker`);
    const updateClient = client(updateApplication);
    const deleteClient = client(deleteApplication);
    const release = deferred();
    let blocker: Promise<void> | undefined;
    const operations: Promise<unknown>[] = [];
    let primaryError: unknown;

    try {
      await observer.subgroup.createMany({
        data: [
          { id: oldGroupId, name: oldGroupId },
          { id: newGroupId, name: newGroupId },
        ],
      });
      const existing = await observer.sharedResource.create({
        data: {
          url: resourceUrl,
          title: "Existing audience",
          previewEnabled: false,
          isGlobal: false,
          sortOrder: 0,
          subgroups: { create: [{ subgroupId: oldGroupId }] },
        },
      });

      const blockerReady = deferred();
      blocker = blockerClient.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "Subgroup" WHERE id = ${newGroupId} FOR UPDATE`;
        blockerReady.resolve();
        await release.promise;
      });
      await blockerReady.promise;

      const service = createSharedResourceService(createPrismaSharedResourceRepository(updateClient));
      const updateOutcome = tracked(service.updateResource(existing.id, input(resourceUrl, [newGroupId])));
      const deleteOutcome = tracked(deleteSubgroupPreservingResourceAudiences(newGroupId, deleteClient));
      operations.push(updateOutcome, deleteOutcome);

      await waitForBlockedClients(observer, [updateApplication, deleteApplication]);
      release.resolve();
      await blocker;

      const [updated, deleted] = await Promise.all([updateOutcome, deleteOutcome]);
      expect([updated, deleted].filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
      if (updated.status === "rejected") {
        expect(isPrismaCode(updated.reason, "P2003")).toBe(true);
        expect(deleted.status).toBe("fulfilled");
      } else {
        expect(deleted.status).toBe("rejected");
        if (deleted.status === "rejected") {
          expect(deleted.reason).toBeInstanceOf(SubgroupResourceAudienceConflictError);
        }
      }

      const persisted = await observer.sharedResource.findUniqueOrThrow({
        where: { id: existing.id },
        include: { subgroups: true },
      });
      expect(persisted.isGlobal).toBe(false);
      expect(persisted.subgroups).toHaveLength(1);
      expect([oldGroupId, newGroupId]).toContain(persisted.subgroups[0]?.subgroupId);
    } catch (error) {
      primaryError = error;
    } finally {
      await finishConcurrencyTest({
        primaryError,
        release: release.resolve,
        operations,
        blocker,
        observer,
        resourceUrl,
        subgroupIds: [oldGroupId, newGroupId],
        clients: [observer, blockerClient, updateClient, deleteClient],
      });
    }
  }, 10_000);
});
