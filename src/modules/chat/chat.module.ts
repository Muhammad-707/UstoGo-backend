import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { FilesModule } from '@modules/files/files.module';

import { AdminConversationsController } from './controllers/admin-conversations.controller';
import { ConversationsController } from './controllers/conversations.controller';
import { MessagesController } from './controllers/messages.controller';
import { ChatGateway } from './gateway/chat.gateway';
import { ConversationsService } from './services/conversations.service';
import { MessagesService } from './services/messages.service';

/**
 * F-12 (MODULES.md › ChatModule). Imports `AuthModule` only for the JWT
 * verification `ChatGateway` reuses for the socket handshake, and `FilesModule` for
 * attachment ownership checks — never `BookingsModule`, which is queried directly
 * through `PrismaModule` for the `NO_SHARED_BOOKING` gate, the same "read another
 * module's table, depend on its service only for behaviour" split `ReviewsModule`
 * uses for the completed-booking check.
 */
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [ConversationsController, MessagesController, AdminConversationsController],
  providers: [ConversationsService, MessagesService, ChatGateway],
  exports: [ConversationsService, MessagesService],
})
export class ChatModule {}
