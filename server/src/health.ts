import { prisma } from "./db.js";

export async function checkDatabase(
  query: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`
): Promise<boolean> {
  try {
    await query();
    return true;
  } catch {
    return false;
  }
}
