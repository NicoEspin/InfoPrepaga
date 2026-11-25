import { Module } from '@nestjs/common';
import { CrmModule } from '../../crm/crm.module';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  YCloudAdminController,
  YCloudWebhookController,
} from './ycloud.controller';
import { YCloudService } from './ycloud.service';
import { YCloudSignatureGuard } from './ycloud-signature.guard';

@Module({
  imports: [CrmModule, PrismaModule],
  controllers: [YCloudWebhookController, YCloudAdminController],
  providers: [YCloudService, YCloudSignatureGuard],
})
export class YCloudModule {}
