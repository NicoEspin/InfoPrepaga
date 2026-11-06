import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { UsersModule } from '../users/users.module';
import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { R2Service } from './r2.service';
import { LeadImportService } from './lead-import.service';
import { LeadImportController } from './lead-import.controller';
import { ImportMappingController } from './import-mapping.controller';
import { ImportMappingService } from './import-mapping.service';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [
    PipelineController,
    CrmController,
    AttachmentsController,
    LeadImportController,
    ImportMappingController,
  ],
  providers: [
    PipelineService,
    CrmService,
    AttachmentsService,
    R2Service,
    LeadImportService,
    ImportMappingService,
  ],
})
export class CrmModule {}
