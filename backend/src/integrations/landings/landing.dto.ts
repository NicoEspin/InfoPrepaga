import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
    : value;
const optional = (_: unknown, value: unknown) => value !== undefined;

export class LandingLeadDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  submissionId!: string;
  @IsIn(['modal', 'principal', 'inferior']) formId!: string;
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Matches(/^[\p{L}\p{M} .’'-]+$/u)
  name!: string;
  @Transform(trim) @IsString() @MinLength(6) @MaxLength(50) phone!: string;
  @ValidateIf(optional)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @Equals(true) consent!: true;
  @IsString() @Matches(/^[A-Za-z0-9_.-]{1,64}$/) privacyVersion!: string;
  @IsIn(['DEPENDENCIA', 'MONOTRIBUTO', 'PARTICULAR']) employment!: string;
  @ValidateIf(optional) @IsInt() @Min(18) @Max(120) age?: number;
  @ValidateIf(optional)
  @IsIn(['INDIVIDUAL', 'PAREJA', 'FAMILIAR'])
  group?: string;
  @ValidateIf(optional)
  @IsIn(['BASICO', 'EQUILIBRADO', 'PREMIUM', 'SIN_DEFINIR'])
  plan?: string;
  @ValidateIf(optional) @IsInt() @Min(0) @Max(100000000) budget?: number;
}
