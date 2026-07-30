import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { CHAT } from '../../constants/chat.constants';

/** `GET /conversations/:id/messages?cursor=&limit=` — newest first (DATABASE.md §9.2). */
export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page’s last item.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: CHAT.MAX_LIMIT, default: CHAT.DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CHAT.MAX_LIMIT)
  limit: number = CHAT.DEFAULT_LIMIT;
}
