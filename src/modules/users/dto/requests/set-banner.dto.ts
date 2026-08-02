import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Takes the `fileId` from `POST /files/presign` — the same attach-flow as the avatar:
 * the server only ever accepts bytes it has already verified (purpose BANNER).
 */
export class SetBannerDto {
  @ApiProperty({ format: 'uuid', description: 'A confirmed file with purpose BANNER' })
  @IsUUID('4')
  fileId!: string;
}
