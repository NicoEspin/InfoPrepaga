import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const guard = new RolesGuard(reflector as unknown as Reflector);

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

  it('allows requests without required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows users with a matching role', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'ADMIN']);

    expect(
      guard.canActivate(
        createContext({
          roles: ['ADMIN'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('denies users without a matching role', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(() =>
      guard.canActivate(
        createContext({
          roles: ['VENDEDOR'],
          permissions: [],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
