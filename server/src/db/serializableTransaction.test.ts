import { describe, expect, it, vi } from "vitest";
import { serializableTransaction } from "./serializableTransaction.js";

function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(`Prisma ${code}`), { code });
}

describe("serializableTransaction", () => {
  it("retries P2034 conflicts within a bounded attempt count", async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(prismaError("P2034"))
      .mockRejectedValueOnce(prismaError("P2034"))
      .mockResolvedValueOnce("committed");

    await expect(serializableTransaction({ $transaction: transaction }, async () => "work"))
      .resolves.toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("stops after three P2034 attempts", async () => {
    const conflict = prismaError("P2034");
    const transaction = vi.fn().mockRejectedValue(conflict);

    await expect(serializableTransaction({ $transaction: transaction }, async () => "work"))
      .rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("does not retry errors other than P2034", async () => {
    const foreignKey = prismaError("P2003");
    const transaction = vi.fn().mockRejectedValue(foreignKey);

    await expect(serializableTransaction({ $transaction: transaction }, async () => "work"))
      .rejects.toBe(foreignKey);
    expect(transaction).toHaveBeenCalledOnce();
  });
});
