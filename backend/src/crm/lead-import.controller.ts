import { validateOrReject } from 'class-validator';
import { readConfiguration } from './import-portfolio';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  ImportPatchDto,
  ImportSelectionDto,
  ImportRowPatchDto,
  ImportVersionDto,
} from './lead-import.dto';
import { LeadImportService } from './lead-import.service';
import { MAX_IMPORT_BYTES } from './lead-import.parser';
import { ImportResponse } from './lead-import.responses';
@ApiTags('lead-imports')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiResponse({
  status: 403,
  description: 'Solo ADMIN; los lotes pertenecen al usuario que los inició',
})
@Controller('crm/lead-imports')
export class LeadImportController {
  constructor(private readonly imports: LeadImportService) {}
  @Get()
  @ImportResponse('list')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Últimos 20 lotes propios disponibles para revisión o reanudación',
  })
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.imports.list(actor);
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    schema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' } },
      required: ['id'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_IMPORT_BYTES,
        files: 1,
        fields: 2,
        parts: 3,
        fieldSize: 20000,
      },
    }),
  )
  upload(
    @Body('mode') mode: string = 'NEW',
    @Body('configuration') configuration: string | undefined,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (mode !== 'NEW' && mode !== 'HISTORICAL')
      throw new BadRequestException('Modalidad inválida');
    return this.imports.upload(
      file,
      actor,
      mode,
      readConfiguration(configuration),
    );
  }
  @Get('configurations')
  @Header('Cache-Control', 'private, no-store')
  configurations(@CurrentUser() actor: AuthenticatedUser) {
    return this.imports.configurations(actor);
  }
  @Post(':id/reconfigure')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_IMPORT_BYTES,
        files: 1,
        fields: 3,
        parts: 4,
        fieldSize: 20000,
      },
    }),
  )
  reconfigure(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('version', ParseIntPipe) version: number,
    @Body('mode') mode: string,
    @Body('configuration') configuration: string | undefined,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (mode !== 'NEW' && mode !== 'HISTORICAL')
      throw new BadRequestException('Modalidad inválida');
    return this.imports.upload(
      file,
      actor,
      mode,
      readConfiguration(configuration),
      { id, version },
    );
  }
  @Get(':id')
  @ImportResponse('preview')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Vista previa paginada de 50 filas, coincidencias y resumen actualizado',
  })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('filter', new DefaultValuePipe('ALL')) filter: string,
    @Query('sheet') sheet?: string,
    @Query('portfolioClass') portfolioClass?: string,
    @Query('problem') problem?: string,
  ) {
    if (page < 1 || page > 100)
      throw new BadRequestException('Página inválida');
    if (
      ![
        'ALL',
        'CREATE',
        'UPDATE',
        'MERGE',
        'DUPLICATES',
        'REVIEW',
        'SKIP',
      ].includes(filter)
    )
      throw new BadRequestException('Filtro inválido');
    const selection = Object.assign(new ImportSelectionDto(), {
      sheet,
      portfolioClass,
      problem,
    });
    return validateOrReject(selection, { forbidUnknownValues: true })
      .then(() => this.imports.get(id, actor, page, filter, selection))
      .catch((error: unknown) => {
        if (Array.isArray(error))
          throw new BadRequestException('Filtres de revisión inválidos');
        throw error;
      });
  }
  @Patch(':id')
  @ImportResponse('changed')
  @Header('Cache-Control', 'private, no-store')
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportPatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imports.patch(id, dto, actor);
  }
  @Patch(':id/rows/:rowId')
  @ImportResponse('changed')
  @Header('Cache-Control', 'private, no-store')
  row(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: ImportRowPatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imports.patchRow(id, rowId, dto, actor);
  }
  @Post(':id/review')
  @ImportResponse('reviewed', 201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Reconocer las coincidencias actuales sin seleccionar duplicados automáticamente',
  })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportVersionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imports.review(id, dto.version, actor, dto.reviewToken);
  }
  @Post(':id/confirm')
  @ImportResponse('progress', 201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Importar hasta 100 filas; repetir con la nueva versión para reanudar',
  })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportVersionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imports.confirm(id, dto.version, actor, dto.excludePending);
  }
}
