import { IsEnum, IsOptional } from 'class-validator';
import { YCloudInboundStatus } from '@prisma/client';
import { PageDto } from '../../crm/crm.dto';

export class YCloudQueryDto extends PageDto {
  @IsOptional()
  @IsEnum(YCloudInboundStatus)
  status?: YCloudInboundStatus;
}
