import { ApiProperty } from '@nestjs/swagger';

export type AttachmentWithUrl = {
  readonly id: string;
  readonly fileId: string;
  readonly url: string;
};

/** One `MessageAttachment`, resolved to a short-lived read URL (DATABASE.md §9.3). */
export class MessageAttachmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty({ description: 'Short-lived signed read URL.' })
  url!: string;

  static fromEntity(entity: AttachmentWithUrl): MessageAttachmentResponseDto {
    const dto = new MessageAttachmentResponseDto();

    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.url = entity.url;

    return dto;
  }
}
