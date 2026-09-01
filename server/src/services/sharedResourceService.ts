import { PrismaClient, type SharedResource, type SharedResourceSubgroup } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { fetchLinkPreview, type LinkPreview } from "./linkPreview.js";

export type SharedResourceInput = {
  url: string;
  title: string;
  description: string | null;
  previewEnabled: boolean;
  previewImageUrl: string | null;
  previewSiteName: string | null;
  isGlobal: boolean;
  subgroupIds: string[];
};

const rawResourceInputSchema = z.object({
  url: z.string().trim().url().refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Resource URL must use HTTP or HTTPS"),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullable(),
  previewEnabled: z.boolean(),
  previewImageUrl: z.string().trim().nullable(),
  previewSiteName: z.string().trim().nullable(),
  isGlobal: z.boolean(),
  subgroupIds: z.array(z.string().trim().min(1)),
}).superRefine((value, context) => {
  if (!value.isGlobal && new Set(value.subgroupIds).size === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subgroupIds"],
      message: "Targeted resources require at least one subgroup",
    });
  }
});

export const resourceInputSchema = rawResourceInputSchema.transform((value): SharedResourceInput => ({
  ...value,
  previewImageUrl: value.previewEnabled ? value.previewImageUrl : null,
  previewSiteName: value.previewEnabled ? value.previewSiteName : null,
  subgroupIds: value.isGlobal ? [] : [...new Set(value.subgroupIds)],
}));

export const resourceOrderSchema = z.object({
  resourceIds: z.array(z.string().trim().min(1)).superRefine((resourceIds, context) => {
    if (new Set(resourceIds).size !== resourceIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resourceIds"],
        message: "Resource order cannot contain duplicate IDs",
      });
    }
  }),
});

export type ResourceRecord = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  previewEnabled: boolean;
  previewImageUrl: string | null;
  previewSiteName: string | null;
  previewFetchedAt: Date | null;
  isGlobal: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  subgroupIds: string[];
};

export class ResourceNotFoundError extends Error {
  constructor(readonly resourceId: string) {
    super(`Resource ${resourceId} was not found`);
    this.name = "ResourceNotFoundError";
  }
}

export class InvalidResourceOrderError extends Error {
  constructor() {
    super("Resource order must contain every existing resource exactly once");
    this.name = "InvalidResourceOrderError";
  }
}

type ResourceCreateData = Omit<ResourceRecord, "id" | "createdAt" | "updatedAt">;
type ResourceUpdateData = Partial<Omit<ResourceRecord, "id" | "createdAt" | "updatedAt">>;

export interface SharedResourceRepository {
  listResources(): Promise<ResourceRecord[]>;
  findResource(id: string): Promise<ResourceRecord | null>;
  createResource(data: ResourceCreateData): Promise<ResourceRecord>;
  updateResource(id: string, data: ResourceUpdateData): Promise<ResourceRecord>;
  deleteResource(id: string): Promise<void>;
  listUserSubgroupIds(userId: string): Promise<string[]>;
  transaction<T>(work: (repository: SharedResourceRepository) => Promise<T>): Promise<T>;
}

function sortedResources(resources: ResourceRecord[]): ResourceRecord[] {
  return [...resources].sort((left, right) =>
    left.sortOrder - right.sortOrder ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function resourceData(input: SharedResourceInput, previewFetchedAt: Date | null): ResourceCreateData {
  return { ...input, previewFetchedAt, sortOrder: 0 };
}

function normalizeInput(input: SharedResourceInput): SharedResourceInput {
  return resourceInputSchema.parse(input);
}

function requireResource(resource: ResourceRecord | null, id: string): ResourceRecord {
  if (!resource) throw new ResourceNotFoundError(id);
  return resource;
}

async function fetchedPreviewData(
  input: SharedResourceInput,
  fetchPreview: (url: string) => Promise<LinkPreview>
): Promise<Pick<ResourceCreateData, "previewImageUrl" | "previewSiteName" | "previewFetchedAt">> {
  if (!input.previewEnabled) {
    return { previewImageUrl: null, previewSiteName: null, previewFetchedAt: null };
  }

  try {
    const preview = await fetchPreview(input.url);
    return {
      // External images would be resolved again by the browser, outside the
      // server's DNS-pinned preview boundary. Persist no browser-fetchable URL.
      previewImageUrl: null,
      previewSiteName: preview.siteName,
      previewFetchedAt: new Date(),
    };
  } catch {
    return { previewImageUrl: null, previewSiteName: null, previewFetchedAt: null };
  }
}

export function createSharedResourceService(
  repository: SharedResourceRepository,
  fetchPreview: (url: string) => Promise<LinkPreview> = fetchLinkPreview
) {
  return {
    async createResource(input: SharedResourceInput): Promise<ResourceRecord> {
      const normalized = normalizeInput(input);
      const preview = await fetchedPreviewData(normalized, fetchPreview);
      return repository.transaction(async (transaction) => {
        const currentResources = await transaction.listResources();
        const sortOrder = Math.max(-1, ...currentResources.map((resource) => resource.sortOrder)) + 1;
        return transaction.createResource({ ...resourceData(normalized, preview.previewFetchedAt), ...preview, sortOrder });
      });
    },

    async updateResource(id: string, input: SharedResourceInput): Promise<ResourceRecord> {
      const normalized = normalizeInput(input);
      const preview = await fetchedPreviewData(normalized, fetchPreview);
      return repository.transaction(async (transaction) => {
        const current = requireResource(await transaction.findResource(id), id);
        return transaction.updateResource(id, {
          ...resourceData(normalized, preview.previewFetchedAt),
          ...preview,
          sortOrder: current.sortOrder,
        });
      });
    },

    async deleteResource(id: string): Promise<void> {
      await repository.transaction(async (transaction) => {
        requireResource(await transaction.findResource(id), id);
        await transaction.deleteResource(id);
        const remaining = sortedResources(await transaction.listResources());
        await Promise.all(
          remaining.map((resource, sortOrder) =>
            resource.sortOrder === sortOrder
              ? undefined
              : transaction.updateResource(resource.id, { sortOrder })
          )
        );
      });
    },

    async listAdminResources(): Promise<ResourceRecord[]> {
      return sortedResources(await repository.listResources());
    },

    async listResourcesForUser(userId: string): Promise<ResourceRecord[]> {
      const [resources, subgroupIds] = await Promise.all([
        repository.listResources(),
        repository.listUserSubgroupIds(userId),
      ]);
      const userSubgroupIds = new Set(subgroupIds);
      return sortedResources(resources.filter((resource) =>
        resource.isGlobal || resource.subgroupIds.some((subgroupId) => userSubgroupIds.has(subgroupId))
      ));
    },

    async reorderResources(resourceIds: string[]): Promise<ResourceRecord[]> {
      const parsedIds = resourceOrderSchema.parse({ resourceIds }).resourceIds;
      return repository.transaction(async (transaction) => {
        const resources = await transaction.listResources();
        const existingIds = new Set(resources.map((resource) => resource.id));
        if (parsedIds.length !== resources.length || parsedIds.some((id) => !existingIds.has(id))) {
          throw new InvalidResourceOrderError();
        }

        await Promise.all(parsedIds.map((id, sortOrder) => transaction.updateResource(id, { sortOrder })));
        return sortedResources(await transaction.listResources());
      });
    },
  };
}

type PrismaResourceClient = Pick<PrismaClient, "sharedResource" | "subgroupMember">;

type PrismaResourceWithSubgroups = SharedResource & { subgroups: SharedResourceSubgroup[] };

function toResourceRecord(resource: PrismaResourceWithSubgroups): ResourceRecord {
  return {
    id: resource.id,
    url: resource.url,
    title: resource.title,
    description: resource.description,
    previewEnabled: resource.previewEnabled,
    previewImageUrl: resource.previewImageUrl,
    previewSiteName: resource.previewSiteName,
    previewFetchedAt: resource.previewFetchedAt,
    isGlobal: resource.isGlobal,
    sortOrder: resource.sortOrder,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    subgroupIds: resource.subgroups.map((subgroup) => subgroup.subgroupId),
  };
}

function resourceRepositoryOperations(client: PrismaResourceClient): Omit<SharedResourceRepository, "transaction"> {
  return {
    async listResources() {
      const resources = await client.sharedResource.findMany({ include: { subgroups: true } });
      return resources.map(toResourceRecord);
    },

    async findResource(id) {
      const resource = await client.sharedResource.findUnique({ where: { id }, include: { subgroups: true } });
      return resource ? toResourceRecord(resource) : null;
    },

    async createResource(data) {
      const resource = await client.sharedResource.create({
        data: {
          url: data.url,
          title: data.title,
          description: data.description,
          previewEnabled: data.previewEnabled,
          previewImageUrl: data.previewImageUrl,
          previewSiteName: data.previewSiteName,
          previewFetchedAt: data.previewFetchedAt,
          isGlobal: data.isGlobal,
          sortOrder: data.sortOrder,
          subgroups: { create: data.subgroupIds.map((subgroupId) => ({ subgroupId })) },
        },
        include: { subgroups: true },
      });
      return toResourceRecord(resource);
    },

    async updateResource(id, data) {
      const { subgroupIds, ...fields } = data;
      const resource = await client.sharedResource.update({
        where: { id },
        data: {
          ...fields,
          ...(subgroupIds === undefined
            ? {}
            : { subgroups: { deleteMany: {}, create: subgroupIds.map((subgroupId) => ({ subgroupId })) } }),
        },
        include: { subgroups: true },
      });
      return toResourceRecord(resource);
    },

    async deleteResource(id) {
      await client.sharedResource.delete({ where: { id } });
    },

    async listUserSubgroupIds(userId) {
      const memberships = await client.subgroupMember.findMany({ where: { userId } });
      return memberships.map((membership) => membership.subgroupId);
    },
  };
}

function transactionRepository(client: PrismaResourceClient): SharedResourceRepository {
  return {
    ...resourceRepositoryOperations(client),
    transaction: (work) => work(transactionRepository(client)),
  };
}

export const prismaSharedResourceRepository: SharedResourceRepository = {
  ...resourceRepositoryOperations(prisma),
  transaction: (work) => prisma.$transaction((transaction) => work(transactionRepository(transaction))),
};

const defaultService = createSharedResourceService(prismaSharedResourceRepository);

export const createResource = defaultService.createResource;
export const updateResource = defaultService.updateResource;
export const deleteResource = defaultService.deleteResource;
export const listAdminResources = defaultService.listAdminResources;
export const listResourcesForUser = defaultService.listResourcesForUser;
export const reorderResources = defaultService.reorderResources;
