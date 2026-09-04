import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

describe("SharedResource preview image storage", () => {
  it("declares nullable preview image bytes and MIME type", () => {
    const resource = Prisma.dmmf.datamodel.models.find((model) => model.name === "SharedResource");

    expect(resource?.fields.find(({ name }) => name === "previewImageData"))
      .toMatchObject({ type: "Bytes", isRequired: false });
    expect(resource?.fields.find(({ name }) => name === "previewImageMimeType"))
      .toMatchObject({ type: "String", isRequired: false });
  });
});
