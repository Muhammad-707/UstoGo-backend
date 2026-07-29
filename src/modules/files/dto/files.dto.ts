import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FilePurpose, type File } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PresignRequestDto {
  @ApiProperty({ enum: FilePurpose, enumName: 'FilePurpose', example: FilePurpose.AVATAR })
  @IsEnum(FilePurpose)
  purpose!: FilePurpose;

  @ApiProperty({ example: 'image/jpeg', description: 'Declared type — verified after upload' })
  @IsString()
  @MaxLength(150)
  mimeType!: string;

  @ApiProperty({ example: 204_800, minimum: 1, description: 'Declared size in bytes' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiPropertyOptional({
    example: 'portrait.jpg',
    description: 'Only the extension is used, and only if it is a short alphanumeric run.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  fileName?: string;
}

export class PresignResponseDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;

  @ApiProperty({ description: 'PUT the binary here directly. It never passes through the API.' })
  uploadUrl!: string;

  @ApiProperty({ example: 'avatars/9f1c…/3b8e….jpg' }) fileKey!: string;

  @ApiProperty({ example: 900, description: 'Seconds until the upload URL expires' })
  expiresIn!: number;
}

export class FileResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'avatars/9f1c…/3b8e….jpg' }) key!: string;
  @ApiProperty({ example: 'image/jpeg', description: 'The stored object’s real type' })
  mimeType!: string;
  @ApiProperty({ example: 204_800, description: 'The stored object’s real size' })
  sizeBytes!: number;
  @ApiProperty({ enum: FilePurpose, enumName: 'FilePurpose' }) purpose!: FilePurpose;
  @ApiProperty({ example: true }) isConfirmed!: boolean;

  static fromEntity(file: File): FileResponseDto {
    return {
      id: file.id,
      key: file.key,
      mimeType: file.mimeType,
      // BigInt does not survive JSON.stringify; a byte count fits a double comfortably.
      sizeBytes: Number(file.sizeBytes),
      purpose: file.purpose,
      isConfirmed: file.isConfirmed,
    };
  }
}

export class ReadUrlResponseDto {
  @ApiProperty({ description: 'Short-lived signed URL' }) url!: string;
  @ApiProperty({ example: 900 }) expiresIn!: number;
}
