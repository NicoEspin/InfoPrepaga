import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommercialStage } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LeadQueryDto } from './crm.dto';

export class PipelineQueryDto extends LeadQueryDto {
  @ApiPropertyOptional({ enum: CommercialStage })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsEnum(CommercialStage)
  stage?: CommercialStage;
}
export class MovePipelineDto {
  @ApiProperty({ enum: CommercialStage })
  @IsEnum(CommercialStage)
  stage!: CommercialStage;
  @ApiProperty()
  @IsInt()
  @Min(1)
  version!: number;
  @ApiPropertyOptional({
    description: 'Obligatorio al corregir un cierre (solo ADMIN)',
  })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(500)
  reason?: string;
}
