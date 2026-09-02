import { Prisma } from "@prisma/client";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export type SerializableTransactionRunner = {
  $transaction<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel }
  ): Promise<T>;
};

function isWriteConflict(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2034";
}

export async function serializableTransaction<T>(
  client: SerializableTransactionRunner,
  work: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isWriteConflict(error) || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw error;
    }
  }
  throw new Error("Unreachable serializable transaction state");
}
