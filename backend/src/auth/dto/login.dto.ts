import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsByteLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MinLength(8)
  @IsByteLength(0, 72)
  password!: string;
}
