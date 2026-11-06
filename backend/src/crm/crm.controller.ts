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
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CrmService } from './crm.service';
import {
  AssignmentDto,
  CreateLeadDto,
  CreateTaskDto,
  EditLeadDto,
  EditTaskDto,
  LeadQueryDto,
  NoteDto,
  PageDto,
  SourceActiveDto,
  SourceDto,
  StatusDto,
  TaskQueryDto,
  UserSettingsDto,
} from './crm.dto';
import { CrmResponse } from './crm.responses';

@ApiTags('crm')
@ApiBearerAuth()
@Roles('ADMIN', 'VENDEDOR')
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('catalogs')
  @CrmResponse('catalogs')
  catalogs(@CurrentUser() actor: AuthenticatedUser) {
    return this.crm.catalogs(actor);
  }

  @Post('sources')
  @Roles('ADMIN')
  @CrmResponse('source', false, 201)
  createSource(
    @Body() dto: SourceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.createSource(dto, actor);
  }

  @Patch('sources/:id')
  @Roles('ADMIN')
  @CrmResponse('source')
  sourceActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SourceActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.sourceActive(id, dto.isActive, actor);
  }

  @Get('users')
  @Roles('ADMIN')
  @CrmResponse('users')
  users(@CurrentUser() actor: AuthenticatedUser) {
    return this.crm.users(actor);
  }

  @Patch('users/:id')
  @Roles('ADMIN')
  @CrmResponse('settings')
  settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UserSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.userSettings(id, dto, actor);
  }

  @Get('leads')
  @CrmResponse('lead', true)
  leads(@Query() query: LeadQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.crm.leads(query, actor);
  }

  @Post('leads')
  @Roles('ADMIN')
  @CrmResponse('lead', false, 201)
  createLead(
    @Body() dto: CreateLeadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.createLead(dto, actor);
  }

  @Get('leads/:id')
  @CrmResponse('profile')
  profile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.profile(id, actor);
  }

  @Patch('leads/:id')
  @CrmResponse('lead')
  editLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditLeadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.editLead(id, dto, actor);
  }

  @Get('leads/:id/import-appearances')
  @CrmResponse('appearances')
  @ApiOperation({
    summary:
      'Procedencias históricas paginadas; mismo alcance del lead, sin duplicar reimportaciones',
  })
  appearances(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.importAppearances(id, query, actor);
  }

  @Patch('leads/:id/status')
  @CrmResponse('lead')
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.status(id, dto, actor);
  }

  @Patch('leads/:id/assignment')
  @Roles('ADMIN')
  @CrmResponse('lead')
  @ApiOperation({
    summary: 'Reasignar y transferir tareas pendientes de forma atómica',
  })
  assignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.assign(id, dto, actor);
  }

  @Get('leads/:id/history')
  @CrmResponse('activity', true)
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.history(id, query, actor);
  }

  @Post('leads/:id/notes')
  @CrmResponse('note', false, 201)
  note(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.note(id, dto.text, actor);
  }

  @Get('tasks')
  @CrmResponse('task', true)
  tasks(@Query() query: TaskQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.crm.tasks(query, actor);
  }

  @Post('tasks')
  @CrmResponse('task', false, 201)
  createTask(
    @Body() dto: CreateTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.createTask(dto, actor);
  }

  @Patch('tasks/:id')
  @CrmResponse('task')
  editTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crm.editTask(id, dto, actor);
  }
}
