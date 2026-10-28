import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

// Only pass identities resolved by the backend session strategy to services.
export function assertAdmin(
  actor: AuthenticatedUser,
  permission?: string,
): void {
  if (
    !actor?.roles.includes('ADMIN') ||
    (permission && !actor.permissions.includes(permission))
  ) {
    throw new ForbiddenException('Administrative access required');
  }
}
