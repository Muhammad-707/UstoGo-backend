import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';

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
    description: 'Public. In-process cached for 5 minutes (FR-5.1).',
  })
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  async tree(): Promise<CategoryResponseDto[]> {
    const nodes = await this.categories.getTree();

    return nodes.map((node) => CategoryResponseDto.fromNode(node));
  }

  @Get(':slug')
  @Public()
  @ApiOperation({
    summary: 'A single category, with its ancestors and children',
    description: 'Public. 404s for an inactive category or one with an inactive ancestor.',
  })
  @ApiOkResponse({ type: CategoryResponseDto })
  async bySlug(@Param('slug') slug: string): Promise<CategoryResponseDto> {
    return this.categories.getBySlug(slug);
  }
}
