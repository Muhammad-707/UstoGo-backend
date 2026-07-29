import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

import { PaginatedDto } from '../dto/paginated.dto';

/**
 * Documents the collection envelope from API.md §1.3 with a concrete element type.
 *
 * `PaginatedDto` is generic, and TypeScript generics are erased before the Swagger
 * plugin ever sees them; composing the schema by reference is the only way the
 * generated document ends up with the real item type instead of `object`.
 */
export const ApiPaginatedResponse = <T extends Type<unknown>>(model: T): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(PaginatedDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedDto) },
          { properties: { items: { type: 'array', items: { $ref: getSchemaPath(model) } } } },
        ],
      },
    }),
  );
