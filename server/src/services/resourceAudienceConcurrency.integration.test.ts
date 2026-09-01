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
    } finally {
      release.resolve();
      await blocker?.catch(() => undefined);
      await observer.sharedResource.deleteMany({ where: { url: resourceUrl } }).catch(() => undefined);
      await observer.subgroup.deleteMany({ where: { id: subgroupId } }).catch(() => undefined);
      await Promise.all([observer, blockerClient, createClient, deleteClient].map((value) => value.$disconnect()));
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
    } finally {
      release.resolve();
      await blocker?.catch(() => undefined);
      await observer.sharedResource.deleteMany({ where: { url: resourceUrl } }).catch(() => undefined);
      await observer.subgroup.deleteMany({
        where: { id: { in: [firstGroupId, secondGroupId] } },
      }).catch(() => undefined);
      await Promise.all([observer, blockerClient, firstDeleteClient, secondDeleteClient]
        .map((value) => value.$disconnect()));
    }
  }, 10_000);
});
