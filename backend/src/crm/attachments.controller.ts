import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AttachmentsService, type AttachmentFile } from './attachments.service';
import {
  AttachmentDeleteResponseDto,
  AttachmentDownloadResponseDto,
  AttachmentPageResponseDto,
  AttachmentResponseDto,
  RenameAttachmentDto,
} from './attachments.dto';
import { PageDto } from './crm.dto';

@ApiTags('lead-attachments')
@ApiBearerAuth()
@Roles('ADMIN', 'VENDEDOR')
@Controller('crm/leads/:leadId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AttachmentPageResponseDto })
  list(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query() query: PageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.list(leadId, query, actor);
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @UploadedFile() file: AttachmentFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.upload(leadId, file, actor);
  }
  @Patch(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AttachmentResponseDto })
  rename(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameAttachmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.rename(leadId, id, dto, actor);
  }
  @Get(':id/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AttachmentDownloadResponseDto })
  @ApiOperation({
    summary: 'URL privada de descarga con vencimiento de 60 segundos',
  })
  download(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.download(leadId, id, actor);
  }
  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AttachmentDeleteResponseDto })
  remove(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.remove(leadId, id, actor);
  }
}
