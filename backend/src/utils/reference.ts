import type { Prisma } from '@prisma/client';

/**
 * Atomically generates the next human-readable report reference number.
 * Format: RW-<year>-<6-digit sequence>, e.g. RW-2026-000042.
 *
 * Uses a per-year counter row updated inside the caller's transaction so that
 * concurrent submissions can never collide.
 */
export async function nextReferenceNo(tx: Prisma.TransactionClient, year = new Date().getFullYear()): Promise<string> {
  // Ensure the counter row exists (no-op when it does).
  await tx.$executeRaw`INSERT INTO ReferenceCounter (\`year\`, \`value\`) VALUES (${year}, 0) ON DUPLICATE KEY UPDATE \`year\` = \`year\``;
  await tx.$executeRaw`UPDATE ReferenceCounter SET \`value\` = \`value\` + 1 WHERE \`year\` = ${year}`;

  const row = await tx.referenceCounter.findUnique({ where: { year } });
  const seq = row?.value ?? 1;
  return `RW-${year}-${String(seq).padStart(6, '0')}`;
}
