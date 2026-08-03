import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentLocale } from '@common/decorators/locale.decorator';
import { Public } from '@common/decorators/public.decorator';
import type { Locale } from '@common/utils/locale.util';

import { CategoryResponseDto } from '../dto/responses/category.response.dto';
import { CategoriesService } from '../services/categories.service';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'The active category tree',
    description:
      'Public. In-process cached for 5 minutes (FR-5.1). Localized via the `X-Locale` ' +
      'header (`tj` | `ru` | `en`, defaults to `en`).',
  })
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  async tree(@CurrentLocale() locale: Locale): Promise<CategoryResponseDto[]> {
    const nodes = await this.categories.getTree();

    return nodes.map((node) => CategoryResponseDto.fromNode(node, locale));
  }

  @Get(':slug')
  @Public()
  @ApiOperation({
    summary: 'A single category, with its ancestors and children',
    description:
      'Public. 404s for an inactive category or one with an inactive ancestor. Localized ' +
      'via the `X-Locale` header (`tj` | `ru` | `en`, defaults to `en`).',
  })
  @ApiOkResponse({ type: CategoryResponseDto })
  async bySlug(
    @Param('slug') slug: string,
    @CurrentLocale() locale: Locale,
  ): Promise<CategoryResponseDto> {
    return this.categories.getBySlug(slug, locale);
  }
}
