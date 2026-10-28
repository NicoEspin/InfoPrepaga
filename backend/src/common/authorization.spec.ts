import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';
import { PermissionsService } from '../permissions/permissions.service';
import { assertAdmin } from './authorization';

describe('Administrative service boundaries', () => {
  const vendor: AuthenticatedUser = {
    id: 'vendor',
    email: 'vendor@example.test',
    roles: ['VENDEDOR'],
    permissions: [],
  };
  // An empty database stub makes any accidental query fail the test.
  const db = {} as PrismaService;
  const users = new UsersService(db);
  const roles = new RolesService(db);
  const permissions = new PermissionsService(db);

  it.each([
    ['list users', () => users.findAll(vendor)],
    ['read another user', () => users.findById('another-user', vendor)],
    [
      'assign roles',
      () =>
        users.assignRoles('another-user', { roleIds: ['admin-role'] }, vendor),
    ],
    ['list roles', () => roles.findAll(vendor)],
    ['create a role', () => roles.create({ name: 'ADMIN' }, vendor)],
    ['list permissions', () => permissions.findAll(vendor)],
    [
      'create a permission',
      () => permissions.create({ action: 'manage', resource: 'users' }, vendor),
    ],
  ])(
    'rejects a vendor attempting to %s before querying the database',
    async (_, action) => {
      await expect(
        Promise.resolve().then<unknown>(action),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('also requires the operation permission for an administrator', () => {
    expect(() =>
      assertAdmin({ ...vendor, roles: ['ADMIN'] }, 'users:manage'),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertAdmin(
        { ...vendor, roles: ['ADMIN'], permissions: ['users:manage'] },
        'users:manage',
      ),
    ).not.toThrow();
  });
});
