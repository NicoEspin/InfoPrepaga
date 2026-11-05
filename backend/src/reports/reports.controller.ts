import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PageDto } from '../crm/crm.dto';
import { ReportInputDto, SaveReportDto } from './reports.dto';
import { ReportsService } from './reports.service';
import { reportPdf } from './report-pdf';
import type { Snapshot } from './report-calculation';
import { ReportResponse } from './reports.responses';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('crm/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('catalogs')
  @ReportResponse('catalogs')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Catálogos históricos, incluidos inactivos; sin contactos ni correos',
  })
  catalogs(@CurrentUser() actor: AuthenticatedUser) {
    return this.reports.catalogs(actor);
  }
  @Post('preview')
  @ReportResponse('snapshot', 201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Calcular vista previa consistente (versión 1)' })
  preview(
    @Body() dto: ReportInputDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reports.preview(dto, actor);
  }
  @Post()
  @ReportResponse('report', 201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Recalcular y guardar fotografía inmutable; clave idempotente por autor',
  })
  save(@Body() dto: SaveReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.save(dto, actor);
  }
  @Get()
  @ReportResponse('list')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Historial paginado en servidor; no recalcula leads',
  })
  list(@Query() query: PageDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.list(query, actor);
  }
  @Get(':id')
  @ReportResponse('report')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Leer exclusivamente la fotografía guardada' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reports.detail(id, actor);
  }
  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, schema: { type: 'string', format: 'binary' } })
  @ApiOperation({
    summary:
      'PDF local de la fotografía; memoria temporal, sin R2 ni archivos permanentes',
  })
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const saved = await this.reports.detail(id, actor);
    // Database read/transaction ends before PDF generation starts.
    const buffer = await reportPdf(id, saved.snapshot as unknown as Snapshot);
    const name =
      saved.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 70) || 'reporte';
    response.set({
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${name}-${id.slice(0, 8)}.pdf"`,
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(buffer);
  }
}
