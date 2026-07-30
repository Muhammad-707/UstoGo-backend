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
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { Audit } from '../../audit/decorators/audit.decorator';
import { CreateBannerDto } from '../dto/requests/create-banner.dto';
import { UpdateBannerDto } from '../dto/requests/update-banner.dto';
import { BannerResponseDto } from '../dto/responses/banner.response.dto';
import { BannersService } from '../services/banners.service';

const NOT_FOUND = { description: 'BANNER_NOT_FOUND', type: ErrorResponseDto };
const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/banners')
export class AdminBannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'List every banner', description: 'Includes inactive banners.' })
  @ApiPaginatedResponse(BannerResponseDto)
  async list(@Query() query: PaginationQueryDto): Promise<PaginatedDto<BannerResponseDto>> {
    const { items, total } = await this.banners.listForAdmin(query.page, query.limit);

    return PaginatedDto.from(
      items.map((item) => BannerResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Fetch a single banner' })
  @ApiOkResponse({ type: BannerResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async findOne(@Param('id') id: string): Promise<BannerResponseDto> {
    const banner = await this.banners.getByIdForAdmin(id);

    return BannerResponseDto.fromEntity(banner);
  }

  @Post()
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.BANNER_CREATED, 'Banner')
  @ApiOperation({ summary: 'Create a banner' })
  @ApiCreatedResponse({ type: BannerResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND', type: ErrorResponseDto })
  async create(
    @Body() dto: CreateBannerDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<BannerResponseDto> {
    const created = await this.banners.create(dto, admin.id);

    return BannerResponseDto.fromEntity(created);
  }

  @Patch(':id')
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.BANNER_UPDATED, 'Banner')
  @ApiOperation({ summary: 'Update a banner' })
  @ApiOkResponse({ type: BannerResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiNotFoundResponse({ description: 'BANNER_NOT_FOUND | FILE_NOT_FOUND', type: ErrorResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<BannerResponseDto> {
    const updated = await this.banners.update(id, dto, admin.id);

    return BannerResponseDto.fromEntity(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.BANNER_DELETED, 'Banner')
  @ApiOperation({ summary: 'Delete a banner', description: 'Soft delete.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse(NOT_FOUND)
  async remove(@Param('id') id: string): Promise<void> {
    await this.banners.remove(id);
  }
}
