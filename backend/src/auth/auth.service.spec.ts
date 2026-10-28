import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    toSafeUser: jest.fn(),
  };

  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const jwtService = {
    signAsync: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'access-secret-value',
        'jwt.refreshSecret': 'refresh-secret-value',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshExpiresIn': '7d',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('registers a user and returns tokens', async () => {
    const user = {
      id: 'user-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [],
    };

    usersService.create.mockResolvedValue(user);
    usersService.toSafeUser.mockReturnValue({
      id: user.id,
      email: user.email,
      roles: ['VENDEDOR'],
      permissions: [],
    });
    jwtService.signAsync.mockResolvedValue('access-token');
    prisma.refreshToken.create.mockResolvedValue({ id: 'session-1' });

    const result = await service.register(
      {
        email: 'jane@example.com',
        password: 'StrongPass123!',
        firstName: 'Jane',
        lastName: 'Doe',
      },
      {
        id: 'admin',
        email: 'admin@example.test',
        roles: ['ADMIN'],
        permissions: [],
      },
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toHaveLength(96);
    expect(result.user.email).toBe('jane@example.com');
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('rejects invalid login credentials', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'jane@example.com', password: 'wrong-pass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in with valid credentials', async () => {
    const password = await bcrypt.hash('StrongPass123!', 12);
    const user = {
      id: 'user-1',
      email: 'jane@example.com',
      password,
      isActive: true,
      roles: [],
    };

    usersService.findByEmail.mockResolvedValue(user);
    usersService.toSafeUser.mockReturnValue({
      id: user.id,
      email: user.email,
      roles: ['VENDEDOR'],
      permissions: [],
    });
    jwtService.signAsync.mockResolvedValue('access-token');
    prisma.refreshToken.create.mockResolvedValue({ id: 'session-1' });

    const result = await service.login({
      email: 'jane@example.com',
      password: 'StrongPass123!',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.user.roles).toEqual(['VENDEDOR']);
  });
});
