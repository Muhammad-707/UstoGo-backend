import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';

import { ProductCategoryResponseDto } from '../dto/responses/product-category.response.dto';
import { ProductCategoriesService } from '../services/product-categories.service';

@ApiTags('Marketplace')
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly categories: ProductCategoriesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Active product categories' })
  @ApiOkResponse({ type: ProductCategoryResponseDto, isArray: true })
  async list(): Promise<ProductCategoryResponseDto[]> {
    const categories = await this.categories.listPublic();

    return categories.map((category) => ProductCategoryResponseDto.fromEntity(category));
  }
}
