import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';

import { ProductsQueryDto } from '../dto/requests/products-query.dto';
import { ProductResponseDto } from '../dto/responses/product.response.dto';
import { ProductsService } from '../services/products.service';

@ApiTags('Marketplace')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Browse the shop',
    description: 'Public. Active products only, filterable by categoryId and search.',
  })
  @ApiPaginatedResponse(ProductResponseDto)
  async list(@Query() query: ProductsQueryDto): Promise<PaginatedDto<ProductResponseDto>> {
    const { items, total } = await this.products.listPublic(query);

    return PaginatedDto.from(
      items.map((item) => ProductResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Product detail' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  async findOne(@Param('id') id: string): Promise<ProductResponseDto> {
    const product = await this.products.getPublicById(id);

    return ProductResponseDto.fromEntity(product);
  }
}
