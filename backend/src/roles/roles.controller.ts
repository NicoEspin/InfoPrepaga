import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @Roles('ADMIN')
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Create a role' })
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const role = await this.rolesService.create(dto, actor);
    return this.rolesService.toResponse(role);
  }

  @Get()
  @Roles('ADMIN')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'List roles' })
  async findAll(@CurrentUser() actor: AuthenticatedUser) {
    const roles = await this.rolesService.findAll(actor);
    return roles.map((role) => this.rolesService.toResponse(role));
  }

  @Get(':id')
  @Roles('ADMIN')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Get a role by id' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const role = await this.rolesService.findOne(id, actor);
    return this.rolesService.toResponse(role);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Update a role description' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const role = await this.rolesService.update(id, dto, actor);
    return this.rolesService.toResponse(role);
  }

  @Post(':id/permissions')
  @Roles('ADMIN')
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Replace permissions assigned to a role' })
  async assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const role = await this.rolesService.assignPermissions(id, dto, actor);
    return this.rolesService.toResponse(role);
  }
}
