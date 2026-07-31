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
import { MasterPublicResponseDto } from '@modules/masters/dto/responses/master-public.response.dto';

import { FavoritesService } from '../services/favorites.service';

@ApiTags('Favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: "The caller's saved masters" })
  @ApiOkResponse({ type: MasterPublicResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<MasterPublicResponseDto[]> {
    return this.favorites.list(user.id);
  }

  @Post(':masterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Save a master', description: 'Idempotent.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'MASTER_NOT_FOUND', type: ErrorResponseDto })
  async add(
    @Param('masterId') masterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.favorites.add(user.id, masterId);
  }

  @Delete(':masterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Remove a saved master', description: 'Idempotent.' })
  @ApiNoContentResponse()
  async remove(
    @Param('masterId') masterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.favorites.remove(user.id, masterId);
  }
}
