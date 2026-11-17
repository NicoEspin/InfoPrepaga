import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommercialStage } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LeadQueryDto } from './crm.dto';

export class PipelineQueryDto extends LeadQueryDto {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Mes AAAA-MM; por defecto, el mes actual de Buenos Aires',
  })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @Matches(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'El mes debe tener el formato AAAA-MM',
  })
  month?: string;

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
