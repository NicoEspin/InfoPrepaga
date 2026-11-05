import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RenameAttachmentDto {
  @ApiProperty({ maxLength: 180 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  @Matches(/^[^\p{Cc}/\\]+$/u)
  name!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  version!: number;
}

export class AttachmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) leadId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty({ maximum: 10485760 }) size!: number;
  @ApiProperty({ enum: ['UPLOADING', 'READY', 'DELETING'] }) state!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class AttachmentPageResponseDto {
  @ApiProperty({ type: [AttachmentResponseDto] })
  items!: AttachmentResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class AttachmentDownloadResponseDto {
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiProperty({ example: 60 }) expiresIn!: number;
}

export class AttachmentDeleteResponseDto {
  @ApiProperty() deleted!: boolean;
}
