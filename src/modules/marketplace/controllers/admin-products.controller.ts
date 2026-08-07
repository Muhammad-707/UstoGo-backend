import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';

import { Audit } from '../../audit/decorators/audit.decorator';
import { CreateProductDto } from '../dto/requests/create-product.dto';
import { ProductsQueryDto } from '../dto/requests/products-query.dto';
import { UpdateProductDto } from '../dto/requests/update-product.dto';
import { ProductResponseDto } from '../dto/responses/product.response.dto';
import { ProductsService } from '../services/products.service';

const NOT_FOUND = { description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto };
const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };
const CATEGORY_NOT_FOUND = { description: 'PRODUCT_CATEGORY_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'List every product', description: 'Includes inactive ones.' })
  @ApiPaginatedResponse(ProductResponseDto)
  async list(@Query() query: ProductsQueryDto): Promise<PaginatedDto<ProductResponseDto>> {
    const { items, total } = await this.products.listForAdmin(query);

    return PaginatedDto.from(
      items.map((item) => ProductResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Fetch a single product' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async findOne(@Param('id') id: string): Promise<ProductResponseDto> {
    const product = await this.products.getForAdmin(id);

    return ProductResponseDto.fromEntity(product);
  }

  @Post()
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.PRODUCT_CREATED, 'Product')
  @ApiOperation({ summary: 'Create a product' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiNotFoundResponse(CATEGORY_NOT_FOUND)
  async create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    const created = await this.products.create(dto);

    return ProductResponseDto.fromEntity(created);
  }

  @Patch(':id')
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.PRODUCT_UPDATED, 'Product')
  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiNotFoundResponse({
    description: 'PRODUCT_NOT_FOUND | PRODUCT_CATEGORY_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const updated = await this.products.update(id, dto);

    return ProductResponseDto.fromEntity(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.PRODUCT_DELETED, 'Product')
  @ApiOperation({ summary: 'Delete a product', description: 'Soft delete.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse(NOT_FOUND)
  async remove(@Param('id') id: string): Promise<void> {
    await this.products.remove(id);
  }
}
