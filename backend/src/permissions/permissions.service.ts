import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePermissionDto, actor: AuthenticatedUser) {
    assertAdmin(actor, 'permissions:manage');
    const existing = await this.prisma.permission.findUnique({
      where: {
        action_resource: {
          action: dto.action,
          resource: dto.resource,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Permission already exists');
    }

    return this.prisma.permission.create({ data: dto });
  }

  findAll(actor: AuthenticatedUser) {
    assertAdmin(actor, 'permissions:read');
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  toResponse(permission: {
    id: string;
    action: string;
    resource: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: permission.id,
      key: `${permission.resource}:${permission.action}`,
      action: permission.action,
      resource: permission.resource,
      description: permission.description,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt,
    };
  }
}
