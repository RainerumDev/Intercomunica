import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { serializableTransaction } from "../db/serializableTransaction.js";
import {
  fetchResourcePreview,
  type ResourcePreviewResult,
} from "./resourcePreviewImage.js";

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
  hasPreviewImage: boolean;
  previewSiteName: string | null;
  previewFetchedAt: Date | null;
  isGlobal: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  subgroupIds: string[];
};

export type ResourceImage = { data: Uint8Array; mimeType: string };

export function sanitizeResourceRecord(resource: ResourceRecord): ResourceRecord {
  return { ...resource, previewImageUrl: null };
}

type ResourceImageStorage = {
  previewImageData: Uint8Array | null;
  previewImageMimeType: string | null;
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

export type ResourceCreateData = Omit<ResourceRecord, "id" | "createdAt" | "updatedAt" | "hasPreviewImage"> &
  ResourceImageStorage;
export type ResourceUpdateData = Partial<
  Omit<ResourceRecord, "id" | "createdAt" | "updatedAt" | "hasPreviewImage"> & ResourceImageStorage
>;

export interface SharedResourceRepository {
  listResources(): Promise<ResourceRecord[]>;
  findResource(id: string): Promise<ResourceRecord | null>;
  findResourceImage(id: string): Promise<ResourceImage | null>;
  createResource(data: ResourceCreateData): Promise<ResourceRecord>;
  updateResource(id: string, data: ResourceUpdateData): Promise<ResourceRecord>;
  updateResourceSortOrder(id: string, sortOrder: number): Promise<void>;
  deleteResource(id: string): Promise<void>;
  listUserSubgroupIds(userId: string): Promise<string[]>;
  transaction<T>(work: (repository: SharedResourceRepository) => Promise<T>): Promise<T>;
  audienceTransaction<T>(work: (repository: SharedResourceRepository) => Promise<T>): Promise<T>;
}

function sortedResources(resources: ResourceRecord[]): ResourceRecord[] {
  return [...resources].sort((left, right) =>
    left.sortOrder - right.sortOrder ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function resourceData(input: SharedResourceInput, previewFetchedAt: Date | null): ResourceCreateData {
  return {
    ...input,
    previewFetchedAt,
    previewImageData: null,
    previewImageMimeType: null,
    sortOrder: 0,
  };
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
  fetchPreview: (url: string) => Promise<ResourcePreviewResult>
): Promise<Pick<
  ResourceCreateData,
  | "previewImageUrl"
  | "previewImageData"
  | "previewImageMimeType"
  | "previewSiteName"
  | "previewFetchedAt"
>> {
  if (!input.previewEnabled) {
    return {
      previewImageUrl: null,
      previewImageData: null,
      previewImageMimeType: null,
      previewSiteName: null,
      previewFetchedAt: null,
    };
  }

  try {
    const { preview, image } = await fetchPreview(input.url);
    return {
      // External images would be resolved again by the browser, outside the
      // server's DNS-pinned preview boundary. Persist no browser-fetchable URL.
      previewImageUrl: null,
      previewImageData: image?.data ?? null,
      previewImageMimeType: image?.mimeType ?? null,
      previewSiteName: preview.siteName,
      previewFetchedAt: new Date(),
    };
  } catch {
    return {
      previewImageUrl: null,
      previewImageData: null,
      previewImageMimeType: null,
      previewSiteName: null,
      previewFetchedAt: null,
    };
  }
}

export function createSharedResourceService(
  repository: SharedResourceRepository,
  fetchPreview: (url: string) => Promise<ResourcePreviewResult> = fetchResourcePreview
) {
  return {
    async createResource(input: SharedResourceInput): Promise<ResourceRecord> {
      const normalized = normalizeInput(input);
      const preview = await fetchedPreviewData(normalized, fetchPreview);
      const created = await repository.audienceTransaction(async (transaction) => {
        const currentResources = await transaction.listResources();
        const sortOrder = Math.max(-1, ...currentResources.map((resource) => resource.sortOrder)) + 1;
        return transaction.createResource({ ...resourceData(normalized, preview.previewFetchedAt), ...preview, sortOrder });
      });
      return sanitizeResourceRecord(created);
    },

    async updateResource(id: string, input: SharedResourceInput): Promise<ResourceRecord> {
      const normalized = normalizeInput(input);
      const preview = await fetchedPreviewData(normalized, fetchPreview);
      const updated = await repository.audienceTransaction(async (transaction) => {
        const current = requireResource(await transaction.findResource(id), id);
        return transaction.updateResource(id, {
          ...resourceData(normalized, preview.previewFetchedAt),
          ...preview,
          sortOrder: current.sortOrder,
        });
      });
      return sanitizeResourceRecord(updated);
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
              : transaction.updateResourceSortOrder(resource.id, sortOrder)
          )
        );
      });
    },

    async listAdminResources(): Promise<ResourceRecord[]> {
      return sortedResources(await repository.listResources()).map(sanitizeResourceRecord);
    },

    async listResourcesForUser(userId: string): Promise<ResourceRecord[]> {
      const [resources, subgroupIds] = await Promise.all([
        repository.listResources(),
        repository.listUserSubgroupIds(userId),
      ]);
      const userSubgroupIds = new Set(subgroupIds);
      return sortedResources(resources.filter((resource) =>
        resource.isGlobal || resource.subgroupIds.some((subgroupId) => userSubgroupIds.has(subgroupId))
      )).map(sanitizeResourceRecord);
    },

    async getResourceImageForUser(userId: string, resourceId: string): Promise<ResourceImage> {
      const [resource, subgroupIds] = await Promise.all([
        repository.findResource(resourceId),
        repository.listUserSubgroupIds(userId),
      ]);
      const visible = resource && (
        resource.isGlobal || resource.subgroupIds.some((subgroupId) => subgroupIds.includes(subgroupId))
      );
      if (!visible) throw new ResourceNotFoundError(resourceId);

      const image = await repository.findResourceImage(resourceId);
      if (!image) throw new ResourceNotFoundError(resourceId);
      return image;
    },

    async reorderResources(resourceIds: string[]): Promise<ResourceRecord[]> {
      const parsedIds = resourceOrderSchema.parse({ resourceIds }).resourceIds;
      const reordered = await repository.transaction(async (transaction) => {
        const resources = await transaction.listResources();
        const existingIds = new Set(resources.map((resource) => resource.id));
        if (parsedIds.length !== resources.length || parsedIds.some((id) => !existingIds.has(id))) {
          throw new InvalidResourceOrderError();
        }

        await Promise.all(parsedIds.map((id, sortOrder) => transaction.updateResourceSortOrder(id, sortOrder)));
        return sortedResources(await transaction.listResources());
      });
      return reordered.map(sanitizeResourceRecord);
    },
  };
}

type PrismaResourceClient = Pick<PrismaClient, "sharedResource" | "subgroupMember">;

const publicResourceSelect = {
  id: true,
  url: true,
  title: true,
  description: true,
  previewEnabled: true,
  previewSiteName: true,
  previewFetchedAt: true,
  isGlobal: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  subgroups: { select: { subgroupId: true } },
} satisfies Prisma.SharedResourceSelect;

type PrismaPublicResource = Prisma.SharedResourceGetPayload<{ select: typeof publicResourceSelect }>;

function toResourceRecord(resource: PrismaPublicResource, hasPreviewImage: boolean): ResourceRecord {
  return {
    id: resource.id,
    url: resource.url,
    title: resource.title,
    description: resource.description,
    previewEnabled: resource.previewEnabled,
    previewImageUrl: null,
    hasPreviewImage,
    previewSiteName: resource.previewSiteName,
    previewFetchedAt: resource.previewFetchedAt,
    isGlobal: resource.isGlobal,
    sortOrder: resource.sortOrder,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    subgroupIds: resource.subgroups.map((subgroup) => subgroup.subgroupId),
  };
}

async function previewImageResourceIds(client: PrismaResourceClient): Promise<Set<string>> {
  const resources = await client.sharedResource.findMany({
    where: {
      previewImageData: { not: null },
      previewImageMimeType: { not: null },
    },
    select: { id: true },
  });
  return new Set(resources.map((resource) => resource.id));
}

async function hasPreviewImage(client: PrismaResourceClient, id: string): Promise<boolean> {
  const resource = await client.sharedResource.findFirst({
    where: {
      id,
      previewImageData: { not: null },
      previewImageMimeType: { not: null },
    },
    select: { id: true },
  });
  return resource !== null;
}

function resourceRepositoryOperations(
  client: PrismaResourceClient
): Omit<SharedResourceRepository, "transaction" | "audienceTransaction"> {
  return {
    async listResources() {
      const [resources, imageResourceIds] = await Promise.all([
        client.sharedResource.findMany({ select: publicResourceSelect }),
        previewImageResourceIds(client),
      ]);
      return resources.map((resource) => toResourceRecord(resource, imageResourceIds.has(resource.id)));
    },

    async findResource(id) {
      const resource = await client.sharedResource.findUnique({ where: { id }, select: publicResourceSelect });
      return resource ? toResourceRecord(resource, await hasPreviewImage(client, id)) : null;
    },

    async findResourceImage(id) {
      const resource = await client.sharedResource.findUnique({
        where: { id },
        select: { previewImageData: true, previewImageMimeType: true },
      });
      return resource && resource.previewImageData !== null && resource.previewImageMimeType !== null
        ? { data: resource.previewImageData, mimeType: resource.previewImageMimeType }
        : null;
    },

    async createResource(data) {
      const resource = await client.sharedResource.create({
        data: {
          url: data.url,
          title: data.title,
          description: data.description,
          previewEnabled: data.previewEnabled,
          previewImageUrl: data.previewImageUrl,
          previewImageData: data.previewImageData === null ? null : Buffer.from(data.previewImageData),
          previewImageMimeType: data.previewImageMimeType,
          previewSiteName: data.previewSiteName,
          previewFetchedAt: data.previewFetchedAt,
          isGlobal: data.isGlobal,
          sortOrder: data.sortOrder,
          subgroups: { create: data.subgroupIds.map((subgroupId) => ({ subgroupId })) },
        },
        select: publicResourceSelect,
      });
      return toResourceRecord(
        resource,
        data.previewImageData !== null && data.previewImageMimeType !== null
      );
    },

    async updateResource(id, data) {
      const { subgroupIds, previewImageData, ...fields } = data;
      const resource = await client.sharedResource.update({
        where: { id },
        data: {
          ...fields,
          ...(previewImageData === undefined
            ? {}
            : { previewImageData: previewImageData === null ? null : Buffer.from(previewImageData) }),
          ...(subgroupIds === undefined
            ? {}
            : { subgroups: { deleteMany: {}, create: subgroupIds.map((subgroupId) => ({ subgroupId })) } }),
        },
        select: publicResourceSelect,
      });
      return toResourceRecord(resource, await hasPreviewImage(client, id));
    },

    async updateResourceSortOrder(id, sortOrder) {
      await client.sharedResource.update({
        where: { id },
        data: { sortOrder },
        select: { id: true },
      });
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
    audienceTransaction: (work) => work(transactionRepository(client)),
  };
}

type PrismaResourceRootClient = Pick<
  PrismaClient,
  "sharedResource" | "subgroupMember" | "$transaction"
>;

export function createPrismaSharedResourceRepository(
  client: PrismaResourceRootClient
): SharedResourceRepository {
  return {
    ...resourceRepositoryOperations(client),
    transaction: (work) => serializableTransaction(
      client,
      (transaction) => work(transactionRepository(transaction))
    ),
    audienceTransaction: (work) => serializableTransaction(
      client,
      (transaction) => work(transactionRepository(transaction))
    ),
  };
}

export const prismaSharedResourceRepository = createPrismaSharedResourceRepository(prisma);

const defaultService = createSharedResourceService(prismaSharedResourceRepository);

export const createResource = defaultService.createResource;
export const updateResource = defaultService.updateResource;
export const deleteResource = defaultService.deleteResource;
export const listAdminResources = defaultService.listAdminResources;
export const listResourcesForUser = defaultService.listResourcesForUser;
export const getResourceImageForUser = defaultService.getResourceImageForUser;
export const reorderResources = defaultService.reorderResources;
