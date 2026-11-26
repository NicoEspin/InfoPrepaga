import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { LandingLeadDto } from './landing.dto';
import { landingCatalog, LandingService } from './landing.service';
import type { Landing } from './landing.service';

@Controller('integrations/v1/leads')
export class LandingController {
  constructor(private readonly service: LandingService) {}
  @Public()
  @Post(':landing')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async receive(
    @Param('landing') landing: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: LandingLeadDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!Object.hasOwn(landingCatalog, landing)) throw new NotFoundException();
    const result = await this.service.receive(
      landing as Landing,
      authorization,
      dto,
    );
    response.status(result.replay ? 200 : 201);
    response.setHeader('Cache-Control', 'no-store');
    return { ok: true };
  }
}
