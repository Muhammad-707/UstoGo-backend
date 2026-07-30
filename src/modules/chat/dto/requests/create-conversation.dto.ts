import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** `POST /conversations` (FR-10, BR-60). */
export class CreateConversationDto {
  /** The other party's user id — a client addresses a master and vice versa. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  participantId!: string;
}
