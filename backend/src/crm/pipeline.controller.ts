import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CommercialStage } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PipelineService } from './pipeline.service';
import { MovePipelineDto, PipelineQueryDto } from './pipeline.dto';

@ApiTags('pipeline')
@ApiBearerAuth()
@Roles('ADMIN', 'VENDEDOR')
@Controller('crm/pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}
  @Get()
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['items', 'total', 'page', 'pageSize'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'id',
              'name',
              'company',
              'version',
              'commercialStage',
              'source',
              'assignedTo',
            ],
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              company: { type: 'string', nullable: true },
              version: { type: 'integer' },
              commercialStage: {
                type: 'string',
                enum: Object.values(CommercialStage),
              },
              source: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                },
              },
              assignedTo: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  firstName: { type: 'string', nullable: true },
                  lastName: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        total: { type: 'integer' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Pipeline paginado; VENDEDOR ve únicamente sus leads asignados',
  })
  list(
    @Query() query: PipelineQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pipeline.list(query, actor);
  }
  @Patch(':id')
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['id', 'commercialStage', 'version'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        commercialStage: {
          type: 'string',
          enum: Object.values(CommercialStage),
        },
        version: { type: 'integer' },
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Mover etapa con versión; salir de Cerrado exige ADMIN y motivo',
  })
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MovePipelineDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pipeline.move(id, dto, actor);
  }
}
