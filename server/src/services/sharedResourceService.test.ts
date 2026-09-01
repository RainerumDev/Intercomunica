import { describe, expect, it } from "vitest";
import {
  createSharedResourceService,
  resourceInputSchema,
  resourceOrderSchema,
  type ResourceRecord,
  type SharedResourceRepository,
} from "./sharedResourceService.js";
import type { LinkPreview } from "./linkPreview.js";

const baseTime = new Date("2026-09-01T09:00:00.000Z");

function resource(overrides: Partial<ResourceRecord> & Pick<ResourceRecord, "id">): ResourceRecord {
  return {
    id: overrides.id,
    url: "https://example.org/resource",
    title: `Resource ${overrides.id}`,
    description: null,
    previewEnabled: true,
    previewImageUrl: null,
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
  userSubgroups = new Map<string, string[]>();
  audienceTransactions = 0;
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

  async createResource(data: Omit<ResourceRecord, "id" | "createdAt" | "updatedAt">): Promise<ResourceRecord> {
    const created = resource({
      ...data,
      id: `new-${this.nextId++}`,
      createdAt: new Date(baseTime.getTime() + this.nextId),
      updatedAt: new Date(baseTime.getTime() + this.nextId),
    });
    this.resources.push(created);
    return cloneResource(created);
  }

  async updateResource(
    id: string,
    data: Partial<Omit<ResourceRecord, "id" | "createdAt" | "updatedAt">>
  ): Promise<ResourceRecord> {
    const index = this.resources.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new Error(`Resource ${id} was not found`);
    const updated = resource({
      ...this.resources[index],
      ...data,
      id,
      updatedAt: new Date(baseTime.getTime() + 1000),
      subgroupIds: data.subgroupIds ? [...data.subgroupIds] : this.resources[index].subgroupIds,
    });
    this.resources[index] = updated;
    return cloneResource(updated);
  }

  async deleteResource(id: string): Promise<void> {
    const index = this.resources.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new Error(`Resource ${id} was not found`);
    this.resources.splice(index, 1);
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
  return createSharedResourceService(repository, fetchPreview);
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
      previewSiteName: null,
      previewFetchedAt: null,
    });
    expect(repository.resources[0]).toMatchObject({
      previewImageUrl: null,
      previewSiteName: null,
      previewFetchedAt: null,
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
