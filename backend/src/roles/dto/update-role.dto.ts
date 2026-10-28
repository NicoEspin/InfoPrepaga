import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Handles escalations' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
