import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(50)
  firstName!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;
  @ApiProperty()
  @IsString()
  @MinLength(12)
  @IsByteLength(0, 72)
  password!: string;
  @ApiProperty({ enum: ['ADMIN', 'VENDEDOR'] })
  @IsIn(['ADMIN', 'VENDEDOR'])
  role!: 'ADMIN' | 'VENDEDOR';
}
export class EditUserDto extends PartialType(CreateUserDto, {
  skipNullProperties: false,
}) {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() replacementId?: string;
}
export class AccountActionDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() replacementId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(12)
  @IsByteLength(0, 72)
  password?: string;
}
export class UserQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['ADMIN', 'VENDEDOR']) role?:
    'ADMIN' | 'VENDEDOR';
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['active', 'inactive', 'deleted', 'all'])
  state?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
