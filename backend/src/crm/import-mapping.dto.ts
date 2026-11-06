import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PageDto } from './crm.dto';

export class MappingQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ['ORIGIN', 'ADVISOR', 'DEFAULT'] })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(['ORIGIN', 'ADVISOR', 'DEFAULT'])
  kind?: string;
}
export class MappingIdentityDto {
  @ApiProperty({ enum: ['ORIGIN', 'ADVISOR', 'DEFAULT'] })
  @IsIn(['ORIGIN', 'ADVISOR', 'DEFAULT'])
  kind!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) scope!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(300) key!: string;
  @ApiProperty({ description: 'Fecha exacta de la versión consultada' })
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
export class MappingUpdateDto extends MappingIdentityDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  newKey?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsUUID()
  sourceId?: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'null confirma reparto automático',
  })
  @ValidateIf((_o, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  assignedToId?: string | null;
}
