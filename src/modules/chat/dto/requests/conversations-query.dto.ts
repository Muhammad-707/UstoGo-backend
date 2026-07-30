import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

/** `GET /conversations` — ordered by `lastMessageAt` DESC (API.md §11). */
export class ConversationsQueryDto extends PaginationQueryDto {}
