import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class InvestmentDto {
  @ApiProperty()
  @IsUUID()
  sourceId!: string;
  @ApiProperty({
    nullable: true,
    example: '200000.00',
    description: 'ARS decimal; null = no informada; 0 es válido',
  })
  @ValidateIf((_o, v: unknown) => v !== null)
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
  amount!: string | null;
}
export class ReportInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
  @ApiProperty({ example: '2026-11-04' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;
  @ApiProperty({ example: '2026-11-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
  @ApiProperty({
    type: [String],
    description:
      'Vacío = todos los orígenes concretos al generar, incluye origen desconocido',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  sourceIds!: string[];
  @ApiProperty({
    type: [String],
    description: 'Vacío = todos, incluye Sin asignar y atribución desconocida',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  responsibleIds!: string[];
  @ApiProperty({ type: [InvestmentDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InvestmentDto)
  investments!: InvestmentDto[];
}
export class SaveReportDto extends ReportInputDto {
  @ApiProperty({
    description: 'UUID generado una vez por operación; conservar al reintentar',
  })
  @IsUUID()
  operationKey!: string;
}
