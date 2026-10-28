import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'read' })
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'Action must be lowercase snake case (e.g. read)',
  })
  action!: string;

  @ApiProperty({ example: 'reports' })
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'Resource must be lowercase snake case (e.g. reports)',
  })
  resource!: string;

  @ApiPropertyOptional({ example: 'Read reporting data' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
