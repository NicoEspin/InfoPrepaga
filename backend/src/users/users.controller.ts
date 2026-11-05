import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { AccountsService } from './accounts.service';
import {
  CreateUserDto,
  EditUserDto,
  AccountActionDto,
  UserQueryDto,
} from './dto/manage-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accounts: AccountsService,
  ) {}

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
  async findAll(
    @Query() query: UserQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.list(query, actor);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Crear una cuenta ADMIN o VENDEDOR sin emitir sesión',
  })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.create(dto, actor);
  }
  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Editar cuenta y revocar sesiones si cambian sus credenciales o rol',
  })
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.change(id, dto, actor);
  }
  @Post(':id/deactivate')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Desactivar cuenta y transferir su cartera y tareas pendientes',
  })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.change(id, dto, actor, 'deactivate');
  }
  @Post(':id/delete')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar mediante baja lógica restaurable' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.change(id, dto, actor, 'delete');
  }
  @Post(':id/restore')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Restaurar acceso con recepción de leads pausada' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.change(id, dto, actor, 'restore');
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
    const role = await this.usersService.resolveRole(dto.roleIds[0]);
    const target = await this.usersService.findIdentityById(id);
    return this.accounts.change(id, { version: target.version, role }, actor);
  }
}
