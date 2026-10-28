import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRolesDto } from './dto/assign-roles.dto';

const userInclude = {
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

  async create(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const roleName = 'VENDEDOR';
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new NotFoundException(`Default role ${roleName} not found`);
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    return this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        roles: {
          create: [{ roleId: role.id }],
        },
      },
      include: userInclude,
    });
  }

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
    return this.prisma.user.findUnique({
      where: { email },
      include: userInclude,
    });
  }

  async assignRoles(
    userId: string,
    dto: AssignRolesDto,
    actor: AuthenticatedUser,
  ) {
    assertAdmin(actor, 'users:manage');
    await this.findIdentityById(userId);

    const roles = await this.prisma.role.findMany({
      where: { id: { in: dto.roleIds } },
    });

    if (
      roles.length !== dto.roleIds.length ||
      roles.some((role) => !['ADMIN', 'VENDEDOR'].includes(role.name))
    ) {
      throw new NotFoundException('One or more roles were not found');
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId, roleId })),
      }),
    ]);

    return this.findIdentityById(userId);
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
