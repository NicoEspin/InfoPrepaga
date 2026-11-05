import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsHash,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IMPORT_SHEETS } from './lead-import.parser';

export class ImportVersionDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({
    description: 'Huella de coincidencias recibida en la revisión',
  })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsHash('sha256')
  reviewToken?: string;
}
export class ImportMappingDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsIn(IMPORT_SHEETS)
  sheet?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(300)
  group?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(160)
  advisor?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsUUID()
  sourceId?: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'null confirma reparto automático',
  })
  @ValidateIf((_o, v: unknown) => v !== undefined && v !== null)
  @IsUUID()
  assignedToId?: string | null;
}
export class ImportPatchDto extends ImportVersionDto {
  @ApiPropertyOptional({ enum: IMPORT_SHEETS, isArray: true })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @IsIn(IMPORT_SHEETS, { each: true })
  sheets?: string[];
  @ApiPropertyOptional({ type: [ImportMappingDto] })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportMappingDto)
  mappings?: ImportMappingDto[];
  @ApiPropertyOptional({ enum: ['INCLUDE', 'OMIT', 'AUTO'] })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsIn(['INCLUDE', 'OMIT', 'AUTO'])
  duplicates?: 'INCLUDE' | 'OMIT' | 'AUTO';
}
export class ImportRowPatchDto extends ImportVersionDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(160)
  name?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  phone?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(2000)
  observations?: string;
  @ApiPropertyOptional({ enum: ['AUTO', 'INCLUDE', 'OMIT'] })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsIn(['AUTO', 'INCLUDE', 'OMIT'])
  decision?: 'AUTO' | 'INCLUDE' | 'OMIT';
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsUUID()
  sourceId?: string;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v: unknown) => v !== undefined && v !== null)
  @IsUUID()
  assignedToId?: string | null;
  @ApiPropertyOptional()
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsBoolean()
  acknowledgeDuplicates?: boolean;
}
