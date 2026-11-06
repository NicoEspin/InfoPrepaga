import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ImportMappingService } from './import-mapping.service';
import { MappingResponse } from './import-mapping.responses';
import {
  MappingIdentityDto,
  MappingQueryDto,
  MappingUpdateDto,
} from './import-mapping.dto';

@ApiTags('import-mappings')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('crm/import-mappings')
export class ImportMappingController {
  constructor(private readonly mappings: ImportMappingService) {}
  @Get()
  @MappingResponse('list')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Equivalencias globales paginadas; solo ADMIN' })
  list(
    @Query() query: MappingQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mappings.list(query, actor);
  }
  @Patch()
  @MappingResponse('changed')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Editar equivalencia con versión updatedAt y auditoría; no modifica lotes anteriores',
  })
  change(
    @Body() dto: MappingUpdateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mappings.change(dto, actor);
  }
  @Delete()
  @MappingResponse('removed')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Eliminar equivalencia con control de versión; conserva historial y destinos',
  })
  remove(
    @Body() dto: MappingIdentityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mappings.change(dto, actor, true);
  }
}
