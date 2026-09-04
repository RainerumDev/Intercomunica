import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createPrismaSharedResourceRepository,
  createSharedResourceService,
  ResourceNotFoundError,
  resourceInputSchema,
  resourceOrderSchema,
  type ResourceRecord,
  type ResourceImage,
  type SharedResourceRepository,
} from "./sharedResourceService.js";
import type { LinkPreview } from "./linkPreview.js";
import type { ResourcePreviewResult } from "./resourcePreviewImage.js";

const baseTime = new Date("2026-09-01T09:00:00.000Z");

function resource(overrides: Partial<ResourceRecord> & Pick<ResourceRecord, "id">): ResourceRecord {
  return {
    id: overrides.id,
    url: "https://example.org/resource",
    title: `Resource ${overrides.id}`,
    description: null,
    previewEnabled: true,
    previewImageUrl: null,
    hasPreviewImage: false,
    previewSiteName: null,
    previewFetchedAt: null,
    isGlobal: false,
    sortOrder: 0,
    createdAt: baseTime,
    updatedAt: baseTime,
    subgroupIds: [],
    ...overrides,
  };
}

function cloneResource(value: ResourceRecord): ResourceRecord {
  return {
    ...value,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
    previewFetchedAt: value.previewFetchedAt ? new Date(value.previewFetchedAt) : null,
    subgroupIds: [...value.subgroupIds],
  };
}

class FakeResourceRepository implements SharedResourceRepository {
  resources: ResourceRecord[];
  images = new Map<string, ResourceImage>();
  created: Array<Parameters<SharedResourceRepository["createResource"]>[0]> = [];
  updated: Array<Parameters<SharedResourceRepository["updateResource"]>[1]> = [];
  userSubgroups = new Map<string, string[]>();
  audienceTransactions = 0;
  resourceUpdateCalls = 0;
  sortOrderUpdates: Array<[string, number]> = [];
  private nextId = 1;

  constructor(resources: ResourceRecord[] = []) {
    this.resources = resources.map(cloneResource);
  }

  async listResources(): Promise<ResourceRecord[]> {
    return this.resources.map(cloneResource);
  }

  async findResource(id: string): Promise<ResourceRecord | null> {
    const found = this.resources.find((candidate) => candidate.id === id);
    return found ? cloneResource(found) : null;
  }

  async createResource(data: Parameters<SharedResourceRepository["createResource"]>[0]): Promise<ResourceRecord> {
    this.created.push(data);
    const created = resource({
      ...data,
      id: `new-${this.nextId++}`,
      hasPreviewImage: data.previewImageData !== null && data.previewImageMimeType !== null,
      createdAt: new Date(baseTime.getTime() + this.nextId),
      updatedAt: new Date(baseTime.getTime() + this.nextId),
    });
    this.resources.push(created);
    if (data.previewImageData !== null && data.previewImageMimeType !== null) {
      this.images.set(created.id, {
        data: new Uint8Array(data.previewImageData),
        mimeType: data.previewImageMimeType,
      });
    }
    return cloneResource(created);
  }

  async updateResource(
    id: string,
    data: Parameters<SharedResourceRepository["updateResource"]>[1]
  ): Promise<ResourceRecord> {
    this.updated.push(data);
    this.resourceUpdateCalls++;
    const index = this.resources.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new Error(`Resource ${id} was not found`);
    const updated = resource({
      ...this.resources[index],
      ...data,
      id,
      updatedAt: new Date(baseTime.getTime() + 1000),
      subgroupIds: data.subgroupIds ? [...data.subgroupIds] : this.resources[index].subgroupIds,
      hasPreviewImage: data.previewImageData === undefined
        ? this.resources[index].hasPreviewImage
        : data.previewImageData !== null && data.previewImageMimeType !== null,
    });
    this.resources[index] = updated;
    if (data.previewImageData !== undefined || data.previewImageMimeType !== undefined) {
      if (data.previewImageData !== null && data.previewImageData !== undefined && data.previewImageMimeType) {
        this.images.set(id, {
          data: new Uint8Array(data.previewImageData),
          mimeType: data.previewImageMimeType,
        });
      } else {
        this.images.delete(id);
      }
    }
    return cloneResource(updated);
  }

  async updateResourceSortOrder(id: string, sortOrder: number): Promise<void> {
    const index = this.resources.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new Error(`Resource ${id} was not found`);
    this.resources[index] = resource({
      ...this.resources[index],
      id,
      sortOrder,
      updatedAt: new Date(baseTime.getTime() + 1000),
    });
    this.sortOrderUpdates.push([id, sortOrder]);
  }

  async deleteResource(id: string): Promise<void> {
    const index = this.resources.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new Error(`Resource ${id} was not found`);
    this.resources.splice(index, 1);
  }

  async findResourceImage(id: string): Promise<ResourceImage | null> {
    const image = this.images.get(id);
    return image ? { data: new Uint8Array(image.data), mimeType: image.mimeType } : null;
  }

  async listUserSubgroupIds(userId: string): Promise<string[]> {
    return [...(this.userSubgroups.get(userId) ?? [])];
  }

  private async runTransaction<T>(work: (repository: SharedResourceRepository) => Promise<T>): Promise<T> {
    const resourceSnapshot = this.resources.map(cloneResource);
    const subgroupSnapshot = new Map(
      [...this.userSubgroups.entries()].map(([userId, subgroupIds]) => [userId, [...subgroupIds]])
    );
    try {
      return await work(this);
    } catch (error) {
      this.resources = resourceSnapshot;
      this.userSubgroups = subgroupSnapshot;
      throw error;
    }
  }

  async transaction<T>(work: (repository: SharedResourceRepository) => Promise<T>): Promise<T> {
    return this.runTransaction(work);
  }

  async audienceTransaction<T>(work: (repository: SharedResourceRepository) => Promise<T>): Promise<T> {
    this.audienceTransactions++;
    return this.runTransaction(work);
  }
}

const input = {
  url: "https://example.org/resource",
  title: "Useful resource",
  description: null,
  previewEnabled: true,
  previewImageUrl: null,
  previewSiteName: null,
  isGlobal: false,
  subgroupIds: ["g1"],
};

const previewWithoutMetadata = async (url: string): Promise<LinkPreview> => ({
  finalUrl: url,
  title: null,
  description: null,
  imageUrl: null,
  siteName: null,
});

function resourceService(
  repository: SharedResourceRepository,
  fetchPreview = previewWithoutMetadata
) {
  return createSharedResourceService(repository, async (url: string) => ({
    preview: await fetchPreview(url),
    image: null,
  }) as ResourcePreviewResult);
}

describe("resourceInputSchema", () => {
  it("trims titles at the accepted length bounds", () => {
    expect(resourceInputSchema.parse({ ...input, title: "  A  " }).title).toBe("A");
    expect(resourceInputSchema.parse({ ...input, title: "x".repeat(160) }).title).toHaveLength(160);
  });

  it("rejects empty and overlong titles", () => {
    expect(() => resourceInputSchema.parse({ ...input, title: "   " })).toThrow();
    expect(() => resourceInputSchema.parse({ ...input, title: "x".repeat(161) })).toThrow();
  });

  it("accepts a nullable description and rejects descriptions over 500 characters", () => {
    expect(resourceInputSchema.parse(input).description).toBeNull();
    expect(() => resourceInputSchema.parse({ ...input, description: "x".repeat(501) })).toThrow();
  });

  it("accepts only HTTP and HTTPS resource URLs", () => {
    expect(resourceInputSchema.parse(input).url).toBe("https://example.org/resource");
    expect(() => resourceInputSchema.parse({ ...input, url: "ftp://example.org/file" })).toThrow();
    expect(resourceInputSchema.safeParse({ ...input, url: "not a URL" }).success).toBe(false);
  });

  it("requires a subgroup for targeted resources", () => {
    expect(() => resourceInputSchema.parse({ ...input, subgroupIds: [] })).toThrow();
  });

  it("clears subgroup IDs for global resources", () => {
    expect(resourceInputSchema.parse({ ...input, isGlobal: true, subgroupIds: ["g1", "g2"] }).subgroupIds)
      .toEqual([]);
  });
});

describe("shared resources", () => {
  it("reads public records without selecting preview bytes and probes complete image pairs by ID", async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([{
        ...resource({ id: "complete-preview" }),
        subgroups: [],
      }])
      .mockResolvedValueOnce([{ id: "complete-preview" }]);
    const repository = createPrismaSharedResourceRepository({
      sharedResource: { findMany },
      subgroupMember: {},
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]);

    await expect(repository.listResources()).resolves.toMatchObject([
      { id: "complete-preview", hasPreviewImage: true },
    ]);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      select: expect.objectContaining({
        id: true,
        subgroups: { select: { subgroupId: true } },
      }),
    });
    const publicSelect = findMany.mock.calls[0][0].select;
    expect(publicSelect).not.toHaveProperty("previewImageUrl");
    expect(publicSelect).not.toHaveProperty("previewImageData");
    expect(publicSelect).not.toHaveProperty("previewImageMimeType");
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        previewImageData: { not: null },
        previewImageMimeType: { not: null },
      },
      select: { id: true },
    });
  });

  it("reports no preview image when the persisted pair is incomplete", async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([
        { ...resource({ id: "data-only" }), subgroups: [] },
        { ...resource({ id: "mime-only" }), subgroups: [] },
      ])
      .mockResolvedValueOnce([]);
    const repository = createPrismaSharedResourceRepository({
      sharedResource: { findMany },
      subgroupMember: {},
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]);

    await expect(repository.listResources()).resolves.toMatchObject([
      { id: "data-only", hasPreviewImage: false },
      { id: "mime-only", hasPreviewImage: false },
    ]);
  });

  it("reads a single public record without selecting preview bytes", async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...resource({ id: "resource-1" }), subgroups: [] });
    const findFirst = vi.fn().mockResolvedValue({ id: "resource-1" });
    const repository = createPrismaSharedResourceRepository({
      sharedResource: { findUnique, findFirst },
      subgroupMember: {},
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]);

    await expect(repository.findResource("resource-1")).resolves.toMatchObject({
      id: "resource-1", hasPreviewImage: true,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "resource-1" },
      select: expect.any(Object),
    });
    const publicSelect = findUnique.mock.calls[0][0].select;
    expect(publicSelect).not.toHaveProperty("previewImageUrl");
    expect(publicSelect).not.toHaveProperty("previewImageData");
    expect(publicSelect).not.toHaveProperty("previewImageMimeType");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "resource-1",
        previewImageData: { not: null },
        previewImageMimeType: { not: null },
      },
      select: { id: true },
    });
  });

  it("returns no image for either incomplete stored preview pair", async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce({ previewImageData: new Uint8Array([137]), previewImageMimeType: null })
      .mockResolvedValueOnce({ previewImageData: null, previewImageMimeType: "image/png" });
    const repository = createPrismaSharedResourceRepository({
      sharedResource: { findUnique },
      subgroupMember: {},
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]);

    await expect(repository.findResourceImage("data-only")).resolves.toBeNull();
    await expect(repository.findResourceImage("mime-only")).resolves.toBeNull();
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: "data-only" },
      select: { previewImageData: true, previewImageMimeType: true },
    });
  });

  it("persists both preview image fields on repository create and update", async () => {
    const previewImageData = new Uint8Array([137, 80, 78, 71]);
    const create = vi.fn().mockResolvedValue({
      ...resource({ id: "created" }),
      previewImageData,
      previewImageMimeType: "image/png",
      subgroups: [],
    });
    const update = vi.fn().mockResolvedValue({
      ...resource({ id: "updated" }),
      previewImageData,
      previewImageMimeType: "image/png",
      subgroups: [],
    });
    const repository = createPrismaSharedResourceRepository({
      sharedResource: { create, update, findFirst: vi.fn().mockResolvedValue({ id: "updated" }) },
      subgroupMember: {},
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]);
    const createData = {
      ...resource({ id: "ignored" }),
      previewImageData,
      previewImageMimeType: "image/png",
    };

    await repository.createResource(createData);
    await repository.updateResource("updated", {
      previewImageData,
      previewImageMimeType: "image/png",
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        previewImageData: Buffer.from(previewImageData),
        previewImageMimeType: "image/png",
      }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        previewImageData: Buffer.from(previewImageData),
        previewImageMimeType: "image/png",
      }),
    }));
  });

  it("updates only sort order without a preview image probe", async () => {
    const update = vi.fn().mockResolvedValue({ id: "resource-1" });
    const findFirst = vi.fn();
    const repository = createPrismaSharedResourceRepository({
      sharedResource: { update, findFirst },
      subgroupMember: {},
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]);

    await repository.updateResourceSortOrder("resource-1", 4);

    expect(update).toHaveBeenCalledWith({
      where: { id: "resource-1" },
      data: { sortOrder: 4 },
      select: { id: true },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("serializes stored preview bytes as a boolean without exposing bytes or a legacy URL", async () => {
    const previewImageData = new Uint8Array([137, 80, 78, 71]);
    const repository = createPrismaSharedResourceRepository({
      sharedResource: {
        findMany: vi.fn().mockResolvedValue([{
          ...resource({
            id: "resource-1",
            previewImageUrl: "https://legacy.example.org/card.png",
          }),
          previewImageData,
          previewImageMimeType: "image/png",
          subgroups: [],
        }]),
      },
      subgroupMember: {},
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]);

    const [publicRecord] = await repository.listResources();

    expect(publicRecord).toMatchObject({ hasPreviewImage: true, previewImageUrl: null });
    expect(publicRecord).not.toHaveProperty("previewImageData");
    expect(publicRecord).not.toHaveProperty("previewImageMimeType");
  });

  it("runs generic resource transactions with Serializable P2034 retry", async () => {
    const transactionClient = {} as Prisma.TransactionClient;
    const rootClient = {
      sharedResource: {},
      subgroupMember: {},
      $transaction: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error("write conflict"), { code: "P2034" }))
        .mockImplementationOnce(async (
          work: (transaction: Prisma.TransactionClient) => Promise<unknown>
        ) => work(transactionClient)),
    };
    const repository = createPrismaSharedResourceRepository(
      rootClient as unknown as Parameters<typeof createPrismaSharedResourceRepository>[0]
    );

    await expect(repository.transaction(async () => "committed")).resolves.toBe("committed");
    expect(rootClient.$transaction).toHaveBeenCalledTimes(2);
    expect(rootClient.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("routes both create and update audience mutations through the audience transaction", async () => {
    const repository = new FakeResourceRepository();
    const service = resourceService(repository);

    const created = await service.createResource(input);
    await service.updateResource(created.id, { ...input, subgroupIds: ["g2"] });

    expect(repository.audienceTransactions).toBe(2);
  });

  it("lists only global and matching subgroup resources in stable resource order", async () => {
    const repository = new FakeResourceRepository([
      resource({ id: "r-global", isGlobal: true, sortOrder: 1, createdAt: new Date("2026-09-01T10:00:00.000Z") }),
      resource({ id: "r-g1-later", subgroupIds: ["g1"], sortOrder: 1, createdAt: new Date("2026-09-01T09:30:00.000Z") }),
      resource({ id: "r-g1-first", subgroupIds: ["g1"], sortOrder: 1, createdAt: new Date("2026-09-01T09:00:00.000Z") }),
      resource({ id: "r-g2", subgroupIds: ["g2"], sortOrder: 0 }),
      resource({ id: "r-first", isGlobal: true, sortOrder: 0 }),
    ]);
    repository.userSubgroups.set("teacher-1", ["g1"]);
    const service = resourceService(repository);

    expect((await service.listResourcesForUser("teacher-1")).map((item) => item.id)).toEqual([
      "r-first", "r-g1-first", "r-g1-later", "r-global",
    ]);
    expect((await service.listAdminResources()).map((item) => item.id)).toEqual([
      "r-first", "r-g2", "r-g1-first", "r-g1-later", "r-global",
    ]);
  });

  it("clears legacy preview image URLs from admin and public service results", async () => {
    const repository = new FakeResourceRepository([
      resource({
        id: "legacy",
        isGlobal: true,
        previewImageUrl: "https://legacy.example.org/card.png",
      }),
    ]);
    const service = resourceService(repository);

    expect(await service.listAdminResources()).toMatchObject([{ previewImageUrl: null }]);
    expect(await service.listResourcesForUser("teacher-1")).toMatchObject([
      { previewImageUrl: null },
    ]);
    expect(repository.resources[0].previewImageUrl).toBe("https://legacy.example.org/card.png");
  });

  it("persists normalized targets and assigns the next sort position on creation", async () => {
    const repository = new FakeResourceRepository([resource({ id: "r1", sortOrder: 4 })]);
    const service = resourceService(repository);

    const created = await service.createResource({ ...input, subgroupIds: ["g1", "g1", "g2"] });

    expect(created).toMatchObject({ title: "Useful resource", sortOrder: 5, subgroupIds: ["g1", "g2"] });
    expect(repository.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, sortOrder: 5, subgroupIds: ["g1", "g2"] }),
    ]));
  });

  it("replaces targets and clears all preview state when preview is disabled", async () => {
    const repository = new FakeResourceRepository([
      resource({
        id: "r1",
        subgroupIds: ["g1"],
        previewImageUrl: "https://images.example.org/preview.png",
        previewSiteName: "Example",
        previewFetchedAt: new Date("2026-09-01T09:15:00.000Z"),
      }),
    ]);
    const service = resourceService(repository);

    const updated = await service.updateResource("r1", {
      ...input,
      previewEnabled: false,
      previewImageUrl: "https://images.example.org/new-preview.png",
      previewSiteName: "Other site",
      subgroupIds: ["g2"],
    });

    expect(updated).toMatchObject({
      subgroupIds: ["g2"], previewEnabled: false, previewImageUrl: null,
      previewSiteName: null, previewFetchedAt: null,
    });
    expect(repository.resources[0]).toMatchObject({ subgroupIds: ["g2"], previewFetchedAt: null });
  });

  it("closes sort-order gaps after deleting a resource", async () => {
    const repository = new FakeResourceRepository([
      resource({ id: "r1", sortOrder: 0 }),
      resource({ id: "r2", sortOrder: 3 }),
      resource({ id: "r3", sortOrder: 9 }),
    ]);
    const service = resourceService(repository);

    await service.deleteResource("r2");

    expect((await repository.listResources()).map((item) => [item.id, item.sortOrder])).toEqual([
      ["r1", 0], ["r3", 1],
    ]);
    expect(repository.sortOrderUpdates).toEqual([["r3", 1]]);
    expect(repository.resourceUpdateCalls).toBe(0);
  });

  it("classifies an update of a missing resource as a not-found domain error", async () => {
    const service = resourceService(new FakeResourceRepository());

    await expect(service.updateResource("missing", input)).rejects.toMatchObject({
      name: "ResourceNotFoundError",
    });
  });

  it("classifies deletion of a missing resource as a not-found domain error", async () => {
    const service = resourceService(new FakeResourceRepository());

    await expect(service.deleteResource("missing")).rejects.toMatchObject({
      name: "ResourceNotFoundError",
    });
  });
});

describe("preview persistence", () => {
  it("persists a securely fetched preview image with its MIME type", async () => {
    const repository = new FakeResourceRepository();
    const image = { data: new Uint8Array([137, 80, 78, 71]), mimeType: "image/png" };
    const service = createSharedResourceService(repository, async (): Promise<ResourcePreviewResult> => ({
      preview: {
        finalUrl: input.url,
        title: "Fetched title",
        description: null,
        imageUrl: "https://cdn.example.org/card.png",
        siteName: "Example",
      },
      image,
    }));

    const created = await service.createResource({
      ...input,
      previewImageUrl: "https://attacker.example.org/spoof.png",
    });

    expect(repository.created[0]).toMatchObject({
      previewImageData: image.data,
      previewImageMimeType: "image/png",
      previewImageUrl: null,
    });
    expect(created).toMatchObject({ hasPreviewImage: true, previewImageUrl: null });
  });

  it("retains fetched metadata when only preview image acquisition fails", async () => {
    const repository = new FakeResourceRepository();
    const service = createSharedResourceService(repository, async (): Promise<ResourcePreviewResult> => ({
      preview: {
        finalUrl: input.url,
        title: "Fetched title",
        description: null,
        imageUrl: "https://cdn.example.org/card.png",
        siteName: "Example",
      },
      image: null,
    }));

    await service.createResource(input);

    expect(repository.created[0]).toMatchObject({
      previewSiteName: "Example",
      previewImageData: null,
      previewImageMimeType: null,
      previewImageUrl: null,
    });
    expect(repository.created[0].previewFetchedAt).toBeInstanceOf(Date);
  });

  it("clears persisted image bytes and metadata when preview is disabled", async () => {
    const repository = new FakeResourceRepository([
      resource({ id: "r1", subgroupIds: ["g1"], hasPreviewImage: true, previewSiteName: "Old site" }),
    ]);
    repository.images.set("r1", {
      data: new Uint8Array([1, 2, 3]),
      mimeType: "image/webp",
    });
    const fetchPreview = vi.fn<() => Promise<ResourcePreviewResult>>();
    const service = createSharedResourceService(repository, fetchPreview);

    await service.updateResource("r1", { ...input, previewEnabled: false });

    expect(fetchPreview).not.toHaveBeenCalled();
    expect(repository.updated[0]).toMatchObject({
      previewImageData: null,
      previewImageMimeType: null,
      previewImageUrl: null,
      previewSiteName: null,
      previewFetchedAt: null,
    });
    await expect(repository.findResourceImage("r1")).resolves.toBeNull();
  });

  it("replaces persisted image bytes when an enabled resource is updated", async () => {
    const repository = new FakeResourceRepository([
      resource({ id: "r1", subgroupIds: ["g1"], hasPreviewImage: true }),
    ]);
    repository.images.set("r1", { data: new Uint8Array([1]), mimeType: "image/gif" });
    const replacement = { data: new Uint8Array([9, 8, 7]), mimeType: "image/png" };
    const service = createSharedResourceService(repository, async (): Promise<ResourcePreviewResult> => ({
      preview: {
        finalUrl: input.url,
        title: null,
        description: null,
        imageUrl: "https://cdn.example.org/replacement.png",
        siteName: "Example",
      },
      image: replacement,
    }));

    await service.updateResource("r1", input);

    await expect(repository.findResourceImage("r1")).resolves.toEqual(replacement);
    expect(repository.updated[0]).toMatchObject({
      previewImageData: replacement.data,
      previewImageMimeType: "image/png",
    });
  });

  it("denies preview image retrieval to users outside the resource audience", async () => {
    const repository = new FakeResourceRepository([
      resource({ id: "resource-1", subgroupIds: ["g1"], hasPreviewImage: true }),
    ]);
    repository.images.set("resource-1", { data: new Uint8Array([1, 2]), mimeType: "image/png" });
    repository.userSubgroups.set("outside-user", ["g2"]);
    const service = resourceService(repository);

    await expect(service.getResourceImageForUser("outside-user", "resource-1"))
      .rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("returns the stored image to a user in the resource audience", async () => {
    const repository = new FakeResourceRepository([
      resource({ id: "resource-1", subgroupIds: ["g1"], hasPreviewImage: true }),
    ]);
    const image = { data: new Uint8Array([1, 2]), mimeType: "image/png" };
    repository.images.set("resource-1", image);
    repository.userSubgroups.set("teacher-1", ["g1"]);
    const service = resourceService(repository);

    await expect(service.getResourceImageForUser("teacher-1", "resource-1")).resolves.toEqual(image);
  });

  it("preserves manual content while omitting external preview images from persistence", async () => {
    const repository = new FakeResourceRepository();
    const service = resourceService(repository, async () => ({
      finalUrl: "https://preview.example.org/article",
      title: "Preview title",
      description: "Preview description",
      imageUrl: "https://cdn.example.org/trusted-image.png",
      siteName: "Trusted site",
    }));
    const beforeCreate = Date.now();

    const created = await service.createResource({
      ...input,
      title: "Manual title",
      description: "Manual description",
      previewImageUrl: "https://attacker.example.org/spoof.png",
      previewSiteName: "Spoofed site",
    });

    expect(created).toMatchObject({
      title: "Manual title",
      description: "Manual description",
      previewImageUrl: null,
      previewSiteName: "Trusted site",
    });
    expect(created.previewFetchedAt).toBeInstanceOf(Date);
    expect(created.previewFetchedAt?.getTime()).toBeGreaterThanOrEqual(beforeCreate);
    expect(repository.resources[0]).toMatchObject({
      previewImageUrl: null,
      previewSiteName: "Trusted site",
    });
  });

  it("refreshes persisted preview metadata and timestamp when an enabled resource URL changes", async () => {
    const oldFetchedAt = new Date("2026-09-01T09:15:00.000Z");
    const repository = new FakeResourceRepository([
      resource({
        id: "r1",
        url: "https://example.org/old",
        previewImageUrl: "https://cdn.example.org/old.png",
        previewSiteName: "Old site",
        previewFetchedAt: oldFetchedAt,
      }),
    ]);
    const service = resourceService(repository, async (url) => ({
      finalUrl: url,
      title: null,
      description: null,
      imageUrl: "https://cdn.example.org/new.png",
      siteName: "New site",
    }));

    const updated = await service.updateResource("r1", {
      ...input,
      url: "https://example.org/new",
      previewImageUrl: "https://attacker.example.org/spoof.png",
      previewSiteName: "Spoofed site",
    });

    expect(updated).toMatchObject({
      url: "https://example.org/new",
      previewImageUrl: null,
      previewSiteName: "New site",
    });
    expect(updated.previewFetchedAt).toBeInstanceOf(Date);
    expect(updated.previewFetchedAt?.getTime()).toBeGreaterThan(oldFetchedAt.getTime());
  });

  it("saves manual content with no preview state when secure preview fetching fails", async () => {
    const repository = new FakeResourceRepository();
    const service = resourceService(repository, async () => {
      throw new Error("preview fetch failed");
    });

    const created = await service.createResource({
      ...input,
      title: "Manual title",
      description: "Manual description",
      previewImageUrl: "https://attacker.example.org/spoof.png",
      previewSiteName: "Spoofed site",
    });

    expect(created).toMatchObject({
      title: "Manual title",
      description: "Manual description",
      previewImageUrl: null,
      hasPreviewImage: false,
      previewSiteName: null,
      previewFetchedAt: null,
    });
    expect(repository.resources[0]).toMatchObject({
      previewImageUrl: null,
      previewSiteName: null,
      previewFetchedAt: null,
    });
    expect(repository.created[0]).toMatchObject({
      previewImageData: null,
      previewImageMimeType: null,
    });
  });

  it("uses the default secure preview fetcher before persisting an unsafe URL", async () => {
    const repository = new FakeResourceRepository();
    const service = createSharedResourceService(repository);

    const created = await service.createResource({
      ...input,
      url: "http://127.0.0.1/private",
      previewImageUrl: "https://attacker.example.org/spoof.png",
      previewSiteName: "Spoofed site",
    });

    expect(created).toMatchObject({
      url: "http://127.0.0.1/private",
      previewImageUrl: null,
      previewSiteName: null,
      previewFetchedAt: null,
    });
  });
});

describe("reorderResources", () => {
  it("stores a complete order contiguously and rejects invalid lists without partial changes", async () => {
    const repository = new FakeResourceRepository([
      resource({ id: "r1", sortOrder: 2 }),
      resource({ id: "r2", sortOrder: 0 }),
      resource({ id: "r3", sortOrder: 1 }),
    ]);
    const service = resourceService(repository);

    await service.reorderResources(["r3", "r1", "r2"]);
    expect((await repository.listResources()).sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => [item.id, item.sortOrder]))
      .toEqual([["r3", 0], ["r1", 1], ["r2", 2]]);
    expect(repository.sortOrderUpdates).toEqual([["r3", 0], ["r1", 1], ["r2", 2]]);
    expect(repository.resourceUpdateCalls).toBe(0);

    const persisted = await repository.listResources();
    await expect(service.reorderResources(["r3", "r1"])).rejects.toMatchObject({
      name: "InvalidResourceOrderError",
    });
    await expect(service.reorderResources(["r3", "r1", "r1"])).rejects.toThrow();
    await expect(service.reorderResources(["r3", "r1", "foreign"])).rejects.toMatchObject({
      name: "InvalidResourceOrderError",
    });
    expect(await repository.listResources()).toEqual(persisted);
  });

  it("rejects duplicate resource IDs in an order payload", () => {
    expect(() => resourceOrderSchema.parse({ resourceIds: ["r1", "r1"] })).toThrow();
  });
});
