import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

const MAX_ATTACHMENTS = 10;

/**
 * `POST /conversations/:id/messages` (FR-10). The length cap is enforced in
 * `MessagesService`, not by a `@MaxLength` here — ERROR_HANDLING.md registers
 * `MESSAGE_TOO_LONG` as its own code, distinct from the generic
 * `VALIDATION_FAILED` a class-validator decorator would produce, so the check has
 * to happen where that code is thrown.
 */
export class SendMessageDto {
  @ApiProperty({ example: 'Can you come by tomorrow at 10am?' })
  @IsString()
  @IsSafeText()
  body!: string;

  /**
   * Ids of the caller's own confirmed `File` rows (`FilePurpose.MESSAGE_ATTACHMENT`).
   * Named after the API.md §11 contract; each entry is resolved and ownership-checked
   * the same way `FilesService.getAttachable` scopes `/files/:id/url` — never a raw
   * storage key, which a client could invent to probe for someone else's object.
   */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @IsUUID('4', { each: true })
  attachmentKeys?: string[];
}
