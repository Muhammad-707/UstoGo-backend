import { Controller, Delete, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiNoContentResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { MessagesService } from '../services/messages.service';

@ApiTags('Chat')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({
    summary: 'Delete the caller’s own message',
    description: 'Sender-side soft delete.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'NOT_FOUND', type: ErrorResponseDto })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.messages.remove(user.id, id);
  }
}
