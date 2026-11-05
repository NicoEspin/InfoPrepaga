import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  ValidateIf,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LeadStatus, TaskPriority } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(160)
  q?: string;
}

export class LeadQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(Object.values(LeadStatus))
  status?: LeadStatus;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  sourceId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  assignedToId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  unassigned?: string;
  @ApiPropertyOptional() @IsIn(['name', 'createdAt', 'updatedAt']) sort:
    'name' | 'createdAt' | 'updatedAt' = 'createdAt';
  @ApiPropertyOptional() @IsIn(['asc', 'desc']) direction: 'asc' | 'desc' =
    'desc';
}

export class CreateLeadDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateIf((_object, value: unknown) => value !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional()
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(50)
  phone?: string;
  @ApiPropertyOptional()
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(160)
  company?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  observations?: string;
  @ApiProperty() @IsUUID() sourceId!: string;
}

export class VersionDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}

export class EditLeadDto extends PartialType(CreateLeadDto, {
  skipNullProperties: false,
}) {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class StatusDto extends VersionDto {
  @ApiProperty({ enum: LeadStatus })
  @IsIn(Object.values(LeadStatus))
  status!: LeadStatus;
}
export class AssignmentDto extends VersionDto {
  @ApiProperty() @IsUUID() assignedToId!: string;
}
export class NoteDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;
}
export class SourceDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
export class SourceActiveDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
export class UserSettingsDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  receivesLeads?: boolean;
}

export class TaskQueryDto extends PageDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  from?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  to?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['pending', 'completed'])
  state?: 'pending' | 'completed';
  @ApiPropertyOptional({ enum: TaskPriority })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(Object.values(TaskPriority))
  priority?: TaskPriority;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  ownerId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  leadId?: string;
}
export class CreateTaskDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  leadId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  ownerId?: string;
  @ApiPropertyOptional()
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  contact?: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;
  @ApiProperty({ enum: TaskPriority })
  @IsIn(Object.values(TaskPriority))
  priority!: TaskPriority;
  @ApiProperty() @IsISO8601({ strict: true }) dueAt!: string;
  @ApiProperty({ enum: [30, 60, 90] }) @IsIn([30, 60, 90]) duration!: number;
}
export class EditTaskDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional()
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  contact?: string;
  @ApiPropertyOptional()
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;
  @ApiPropertyOptional({ enum: TaskPriority })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(Object.values(TaskPriority))
  priority?: TaskPriority;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  dueAt?: string;
  @ApiPropertyOptional({ enum: [30, 60, 90] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn([30, 60, 90])
  duration?: number;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  completed?: boolean;
}
