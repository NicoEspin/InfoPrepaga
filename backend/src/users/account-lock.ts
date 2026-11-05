import { Prisma } from '@prisma/client';

// One lock order for allocation, account lifecycle and session issuance.
export async function lockAccounts(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM assignment_state WHERE id = 1 FOR UPDATE`;
  if (rows.length !== 1)
    throw new Error('Missing commercial migration lock row');
}
