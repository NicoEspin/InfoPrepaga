import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { YCloudSignatureGuard } from './ycloud-signature.guard';
import { YCloudService } from './ycloud.service';
import { YCloudQueryDto } from './ycloud.dto';

@ApiTags('ycloud')
@Controller('webhooks/ycloud')
export class YCloudWebhookController {
  constructor(private readonly service: YCloudService) {}
  @Post()
  @Public()
  @UseGuards(YCloudSignatureGuard)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @HttpCode(200)
  receive(@Body() body: unknown) {
    return this.service.receive(body);
  }
}

@ApiTags('ycloud')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('crm/integrations/ycloud/events')
export class YCloudAdminController {
  constructor(private readonly service: YCloudService) {}
  @Get()
  list(
    @Query() query: YCloudQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.list(query, actor);
  }
  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.detail(id, actor);
  }
  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.retry(id, actor);
  }
}
