import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

import { CursorPaginatedDto } from '../dto/responses/cursor-paginated.dto';

/** Cursor-pagination counterpart of `ApiPaginatedResponse` (`common/decorators`), for
 *  the one endpoint that pages by cursor rather than by page number
 *  (`GET /conversations/:id/messages`). Kept local to this module rather than in
 *  `common/` because it references `CursorPaginatedDto`, and `common/` never imports
 *  from `modules/` (FOLDER_STRUCTURE.md §7.2). */
export const ApiCursorPaginatedResponse = <T extends Type<unknown>>(model: T): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(CursorPaginatedDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(CursorPaginatedDto) },
          { properties: { items: { type: 'array', items: { $ref: getSchemaPath(model) } } } },
        ],
      },
    }),
  );
