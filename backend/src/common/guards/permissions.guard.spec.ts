import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const guard = new PermissionsGuard(reflector as unknown as Reflector);

  const createContext = (user?: {
    roles: string[];
    permissions: string[];
  }): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests without required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows users with all required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['users:read', 'roles:read']);

    expect(
      guard.canActivate(
        createContext({
          roles: ['ADMIN'],
          permissions: ['users:read', 'roles:read', 'permissions:read'],
        }),
      ),
    ).toBe(true);
  });

  it('denies users missing required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['users:manage']);

    expect(() =>
      guard.canActivate(
        createContext({
          roles: ['VENDEDOR'],
          permissions: ['users:read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
