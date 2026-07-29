import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
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
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { Audit } from '../../audit/decorators/audit.decorator';
import { CreateCategoryDto } from '../dto/requests/create-category.dto';
import { UpdateCategoryDto } from '../dto/requests/update-category.dto';
import { CategoryResponseDto } from '../dto/responses/category.response.dto';
import { CategoriesService } from '../services/categories.service';

const NOT_FOUND = { description: 'CATEGORY_NOT_FOUND', type: ErrorResponseDto };
const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.CATEGORY_CREATED, 'Category')
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'CATEGORY_SLUG_TAKEN', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiNotFoundResponse(NOT_FOUND)
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<CategoryResponseDto> {
    const created = await this.categories.create(dto, admin.id);

    return CategoryResponseDto.fromEntity(created);
  }

  @Patch(':id')
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.CATEGORY_UPDATED, 'Category')
  @ApiOperation({
    summary: 'Rename, reparent, reorder or toggle a category',
    description: 'slug is immutable and absent from this body entirely.',
  })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION_FAILED | CATEGORY_DEPTH_EXCEEDED | CATEGORY_INVALID_PARENT',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse(NOT_FOUND)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<CategoryResponseDto> {
    const updated = await this.categories.update(id, dto, admin.id);

    return CategoryResponseDto.fromEntity(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.CATEGORY_UPDATED, 'Category')
  @ApiOperation({
    summary: 'Delete a category',
    description: 'Fails with 409 CATEGORY_IN_USE when it has children; deactivate it instead.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'CATEGORY_IN_USE', type: ErrorResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async remove(@Param('id') id: string): Promise<void> {
    await this.categories.remove(id);
  }
}
