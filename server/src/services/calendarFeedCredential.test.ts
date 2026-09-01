import { describe, expect, it } from "vitest";
import {
  createFeedCredential,
  decryptFeedToken,
  hashFeedToken,
  normalizeFeedPrefix,
} from "./calendarFeedCredential.js";

describe("personal calendar feed credentials", () => {
  it("normalizes only the email local part into a URL-safe prefix", () => {
    expect(normalizeFeedPrefix("Kevin.Delugan+Scuola@rainerum.it")).toBe("kevin.delugan-scuola");
    expect(normalizeFeedPrefix("A__B--C@rainerum.it")).toBe("a__b--c");
  });

  it("hashes tokens deterministically with SHA-256", () => {
    expect(hashFeedToken("literal-token")).toBe(
      "b31b5c9b3fcad1ea6cac76670c936dc52673e2dfbeff20b3e95a907f4f78998a"
    );
  });

  it("creates a URL-safe encrypted credential without plaintext persistence", () => {
    const fixedRandom = () => Buffer.alloc(32, 7);
    const credential = createFeedCredential("Kevin.Delugan@rainerum.it", fixedRandom);

    expect(credential.token).toMatch(/^kevin\.delugan-[A-Za-z0-9_-]{43}$/);
    expect(hashFeedToken(credential.token)).toBe(credential.tokenHash);
    expect(decryptFeedToken(credential.tokenEnc)).toBe(credential.token);
    expect(credential.tokenEnc).not.toContain(credential.token);
    expect(credential.issuedAt).toBeInstanceOf(Date);
  });

  it("encrypts the same token differently on each credential", () => {
    const random = () => Buffer.alloc(32, 7);
    const first = createFeedCredential("Kevin.Delugan@rainerum.it", random);
    const second = createFeedCredential("Kevin.Delugan@rainerum.it", random);

    expect(first.token).toBe(second.token);
    expect(first.tokenEnc).not.toBe(second.tokenEnc);
  });
});
