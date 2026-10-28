import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy session revocation', () => {
  const findUnique = jest.fn();
  const findIdentityById = jest.fn();
  const toSafeUser = jest.fn();
  const strategy = new JwtStrategy(
    {
      getOrThrow: () => 'a-test-secret-of-sufficient-length',
    } as unknown as ConfigService,
    { findIdentityById, toSafeUser } as unknown as UsersService,
    { refreshToken: { findUnique } } as unknown as PrismaService,
  );
  const payload = {
    sub: 'user-1',
    sid: 'session-1',
    email: 'vendor@example.test',
  };

  beforeEach(() => jest.resetAllMocks());
  it('rejects a revoked session before fetching user data', async () => {
    findUnique.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findIdentityById).not.toHaveBeenCalled();
  });
  it('rejects a session belonging to another user', async () => {
    findUnique.mockResolvedValue({
      userId: 'other-user',
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findIdentityById).not.toHaveBeenCalled();
  });
  it('rejects an expired session', async () => {
    findUnique.mockResolvedValue({
      userId: payload.sub,
      expiresAt: new Date(0),
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('loads current roles for an active session', async () => {
    findUnique.mockResolvedValue({
      userId: payload.sub,
      expiresAt: new Date(Date.now() + 60000),
    });
    findIdentityById.mockResolvedValue({ isActive: true });
    toSafeUser.mockReturnValue({
      id: payload.sub,
      email: payload.email,
      roles: ['VENDEDOR'],
      permissions: [],
    });
    expect(await strategy.validate(payload)).toEqual({
      id: payload.sub,
      email: payload.email,
      roles: ['VENDEDOR'],
      permissions: [],
    });
  });
  it('rejects an inactive account', async () => {
    findUnique.mockResolvedValue({
      userId: payload.sub,
      expiresAt: new Date(Date.now() + 60000),
    });
    findIdentityById.mockResolvedValue({ isActive: false });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
