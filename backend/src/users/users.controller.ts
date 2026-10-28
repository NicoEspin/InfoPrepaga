import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const fullUser = await this.usersService.findIdentityById(user.id);
    return this.usersService.toSafeUser(fullUser);
  }

  @Get()
  @Roles('ADMIN')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List all users (admin)' })
  async findAll(@CurrentUser() actor: AuthenticatedUser) {
    const users = await this.usersService.findAll(actor);
    return users.map((user) => this.usersService.toSafeUser(user));
  }

  @Get(':id')
  @Roles('ADMIN')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get a user by id' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.usersService.findById(id, actor);
    return this.usersService.toSafeUser(user);
  }

  @Patch(':id/roles')
  @Roles('ADMIN')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Replace roles assigned to a user' })
  async assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.usersService.assignRoles(id, dto, actor);
    return this.usersService.toSafeUser(user);
  }
}
