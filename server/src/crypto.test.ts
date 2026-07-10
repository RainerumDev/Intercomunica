import { describe, it, expect } from "vitest";

describe("crypto", () => {
  it("roundtrips refresh tokens", async () => {
    const { encrypt, decrypt } = await import("./crypto.js");
    const secret = "1//0abc-refresh-token-àèìòù-🎉";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it("produces distinct ciphertexts per call (random IV)", async () => {
    const { encrypt } = await import("./crypto.js");
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("./crypto.js");
    const enc = encrypt("secret");
    const parts = enc.split(".");
    const flipped = parts[2].startsWith("A") ? "B" + parts[2].slice(1) : "A" + parts[2].slice(1);
    expect(() => decrypt(`${parts[0]}.${parts[1]}.${flipped}`)).toThrow();
    expect(() => decrypt("garbage")).toThrow();
  });
});
