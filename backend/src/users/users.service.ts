import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: AuthenticatedUser) {
    assertAdmin(actor, 'users:read');
    return this.prisma.user.findMany({
      include: userInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findIdentityById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findById(id: string, actor: AuthenticatedUser) {
    assertAdmin(actor, 'users:read');
    return this.findIdentityById(id);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: userInclude,
    });
  }

  async resolveRole(id: string): Promise<'ADMIN' | 'VENDEDOR'> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role || !['ADMIN', 'VENDEDOR'].includes(role.name))
      throw new NotFoundException('Rol no encontrado');
    return role.name as 'ADMIN' | 'VENDEDOR';
  }

  toSafeUser(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{
      role: {
        id: string;
        name: string;
        description: string | null;
        permissions: Array<{
          permission: {
            id: string;
            action: string;
            resource: string;
            description: string | null;
          };
        }>;
      };
    }>;
  }) {
    const roles = user.roles.map((userRole) => userRole.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions.map(
            (rolePermission) =>
              `${rolePermission.permission.resource}:${rolePermission.permission.action}`,
          ),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      roles,
      permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
