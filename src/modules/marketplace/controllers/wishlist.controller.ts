import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { ProductResponseDto } from '../dto/responses/product.response.dto';
import { ProductLikesService } from '../services/product-likes.service';

@ApiTags('Marketplace')
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly likes: ProductLikesService) {}

  @Get()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: "The caller's liked products" })
  @ApiOkResponse({ type: ProductResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ProductResponseDto[]> {
    const products = await this.likes.list(user.id);

    return products.map((product) => ProductResponseDto.fromEntity(product));
  }

  @Post(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Like a product', description: 'Idempotent.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  async add(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.likes.add(user.id, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Unlike a product', description: 'Idempotent.' })
  @ApiNoContentResponse()
  async remove(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.likes.remove(user.id, productId);
  }
}
