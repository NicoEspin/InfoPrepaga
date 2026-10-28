import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'SUPPORT' })
  @IsString()
  @IsIn(['ADMIN', 'VENDEDOR'])
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'Role name must be uppercase snake case (e.g. SUPPORT)',
  })
  name!: string;

  @ApiPropertyOptional({ example: 'Customer support staff' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['22222222-2222-2222-2222-222222222222'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
