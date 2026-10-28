import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-f0-9]{96}$/)
  refreshToken!: string;
}
