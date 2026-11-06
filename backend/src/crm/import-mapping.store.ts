import { ConflictException } from '@nestjs/common';
import { Prisma, type LeadImportMapping } from '@prisma/client';
type Tx = Prisma.TransactionClient;
export const mappingSnapshot = (rule: LeadImportMapping) => ({
  kind: rule.kind,
  scope: rule.scope,
  key: rule.key,
  sourceId: rule.sourceId,
  assignedToId: rule.assignedToId,
  confirmedById: rule.confirmedById,
  updatedAt: rule.updatedAt.toISOString(),
});

/** Saving during an upload must never silently replace another confirmed destination. */
export async function rememberImportMapping(
  tx: Tx,
  identity: { kind: string; scope: string; key: string },
  target: { sourceId?: string; assignedToId?: string | null },
  actorId: string,
) {
  const before = await tx.leadImportMapping.findUnique({
    where: { kind_scope_key: identity },
  });
  const sourceId =
    identity.kind === 'ORIGIN' ? (target.sourceId ?? null) : null;
  const assignedToId =
    identity.kind === 'ORIGIN' ? null : (target.assignedToId ?? null);
  if (before) {
    if (before.sourceId !== sourceId || before.assignedToId !== assignedToId)
      throw new ConflictException(
        'La equivalencia ya tiene otro destino. Editala desde Administración o aplicá el cambio solo a este lote',
      );
    return before;
  }
  const after = await tx.leadImportMapping.create({
    data: { ...identity, sourceId, assignedToId, confirmedById: actorId },
  });
  await tx.leadImportMappingEvent.create({
    data: { actorId, action: 'CREATE', after: mappingSnapshot(after) },
  });
  return after;
}
