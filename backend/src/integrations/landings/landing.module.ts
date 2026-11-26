import { Module } from '@nestjs/common';
import { CrmModule } from '../../crm/crm.module';
import { LandingController } from './landing.controller';
import { LandingService } from './landing.service';

@Module({
  imports: [CrmModule],
  controllers: [LandingController],
  providers: [LandingService],
})
export class LandingModule {}
