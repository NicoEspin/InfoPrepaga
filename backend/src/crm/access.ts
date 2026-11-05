import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

export function isAdmin(actor: AuthenticatedUser): boolean {
  return actor.roles.includes('ADMIN');
}
export function leadScope(actor: AuthenticatedUser): Prisma.LeadWhereInput {
  if (isAdmin(actor)) return {};
  if (!actor.roles.includes('VENDEDOR')) throw new ForbiddenException();
  return { assignedToId: actor.id };
}
export function taskScope(
  actor: AuthenticatedUser,
): Prisma.CommercialTaskWhereInput {
  if (isAdmin(actor)) return {};
  if (!actor.roles.includes('VENDEDOR')) throw new ForbiddenException();
  // A linked task ALWAYS follows the lead, including completed historical tasks.
  return {
    OR: [
      { lead: { assignedToId: actor.id } },
      { leadId: null, ownerId: actor.id },
    ],
  };
}
