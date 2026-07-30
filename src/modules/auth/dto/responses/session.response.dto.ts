import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { SessionSummary } from '../../services/token.service';

/** One active device (a refresh-token family), from `GET /auth/sessions`. */
export class SessionResponseDto {
  @ApiProperty({ description: 'Family id — pass to DELETE /auth/sessions/:id to revoke.' })
  id!: string;

  @ApiPropertyOptional({ nullable: true, example: 'a1b2c3' })
  deviceId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)' })
  userAgent!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '203.0.113.7' })
  ipAddress!: string | null;

  @ApiProperty({ description: 'When this device first logged in.' })
  createdAt!: Date;

  @ApiProperty({ description: 'When this device last refreshed its session.' })
  lastActiveAt!: Date;

  @ApiProperty({ description: 'Whether this is the session the request was authenticated with.' })
  current!: boolean;

  static from(summary: SessionSummary): SessionResponseDto {
    return { ...summary };
  }
}
