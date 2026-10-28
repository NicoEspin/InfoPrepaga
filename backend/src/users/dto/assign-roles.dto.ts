import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsUUID,
} from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({
    example: ['11111111-1111-1111-1111-111111111111'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
