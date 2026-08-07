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
import { ErrorResponseDto } from '@common/dto/error-response.dto';

import { Audit } from '../../audit/decorators/audit.decorator';
import { CreateProductCategoryDto } from '../dto/requests/create-product-category.dto';
import { UpdateProductCategoryDto } from '../dto/requests/update-product-category.dto';
import { ProductCategoryResponseDto } from '../dto/responses/product-category.response.dto';
import { ProductCategoriesService } from '../services/product-categories.service';

const NOT_FOUND = { description: 'PRODUCT_CATEGORY_NOT_FOUND', type: ErrorResponseDto };
const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/product-categories')
export class AdminProductCategoriesController {
  constructor(private readonly categories: ProductCategoriesService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'List every product category', description: 'Includes inactive ones.' })
  @ApiOkResponse({ type: ProductCategoryResponseDto, isArray: true })
  async list(): Promise<ProductCategoryResponseDto[]> {
    const categories = await this.categories.listForAdmin();

    return categories.map((category) => ProductCategoryResponseDto.fromEntity(category));
  }

  @Post()
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.PRODUCT_CATEGORY_CREATED, 'ProductCategory')
  @ApiOperation({ summary: 'Create a product category' })
  @ApiCreatedResponse({ type: ProductCategoryResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  async create(@Body() dto: CreateProductCategoryDto): Promise<ProductCategoryResponseDto> {
    const created = await this.categories.create(dto);

    return ProductCategoryResponseDto.fromEntity(created);
  }

  @Patch(':id')
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.PRODUCT_CATEGORY_UPDATED, 'ProductCategory')
  @ApiOperation({ summary: 'Update a product category' })
  @ApiOkResponse({ type: ProductCategoryResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiNotFoundResponse(NOT_FOUND)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
  ): Promise<ProductCategoryResponseDto> {
    const updated = await this.categories.update(id, dto);

    return ProductCategoryResponseDto.fromEntity(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.PRODUCT_CATEGORY_DELETED, 'ProductCategory')
  @ApiOperation({ summary: 'Delete a product category', description: 'Soft delete.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse(NOT_FOUND)
  async remove(@Param('id') id: string): Promise<void> {
    await this.categories.remove(id);
  }
}
