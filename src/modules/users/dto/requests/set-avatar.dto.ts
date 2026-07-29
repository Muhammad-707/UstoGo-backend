import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * FR-3.3. Takes the `fileId` from `POST /files/presign`, not a URL or a key: the id is
 * the only handle the server can resolve back to a row it has verified.
 */
export class SetAvatarDto {
  @ApiProperty({ format: 'uuid', description: 'A confirmed file with purpose AVATAR' })
  @IsUUID('4')
  fileId!: string;
}
