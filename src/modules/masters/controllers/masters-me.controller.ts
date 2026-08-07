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
  Put,
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
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { CurrentLocale } from '@common/decorators/locale.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import type { Locale } from '@common/utils/locale.util';

import { AttachCategoryDto } from '../dto/requests/attach-category.dto';
import { CreateCertificateDto } from '../dto/requests/create-certificate.dto';
import { CreatePortfolioImageDto } from '../dto/requests/create-portfolio-image.dto';
import { PricingSuggestionQueryDto } from '../dto/requests/pricing-suggestion-query.dto';
import { ReorderPortfolioDto } from '../dto/requests/reorder-portfolio.dto';
import { SetAvailabilityDto } from '../dto/requests/set-availability.dto';
import { SetInstantBookDto } from '../dto/requests/set-instant-book.dto';
import { CertificateResponseDto } from '../dto/responses/certificate.response.dto';
import { MasterNpsResponseDto } from '../dto/responses/master-nps.response.dto';
import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterStatusResponseDto } from '../dto/responses/master-status.response.dto';
import { PortfolioImageResponseDto } from '../dto/responses/portfolio-image.response.dto';
import { PricingSuggestionResponseDto } from '../dto/responses/pricing-suggestion.response.dto';
import { MastersService } from '../services/masters.service';
import { PricingSuggestionService } from '../services/pricing-suggestion.service';
import { RecentlyViewedService } from '../services/recently-viewed.service';

const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };
const NOT_FOUND = { description: 'MASTER_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Master Cabinet')
@Controller('masters/me')
export class MastersMeController {
  constructor(
    private readonly masters: MastersService,
    private readonly recentlyViewed: RecentlyViewedService,
    private readonly pricingSuggestion: PricingSuggestionService,
  ) {}

  @Get('status')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({
    summary:
      'The caller’s current approval/availability status, reliability score and instant-book setting',
    description:
      'A pure read — `submit`/`resubmit`/`availability`/`instant-book` all return this ' +
      'same shape as a side effect of the mutation they perform, but nothing previously ' +
      'let a master fetch it without triggering one of those.',
  })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  async status(@CurrentUser() user: AuthenticatedUser): Promise<MasterStatusResponseDto> {
    const master = await this.masters.getByUserId(user.id);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Submit the profile for review' })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  async submit(@CurrentUser() user: AuthenticatedUser): Promise<MasterStatusResponseDto> {
    const master = await this.masters.submitForReview(user.id);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Post('resubmit')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Resubmit after a rejection' })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  async resubmit(@CurrentUser() user: AuthenticatedUser): Promise<MasterStatusResponseDto> {
    const master = await this.masters.submitForReview(user.id);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Patch('availability')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({
    summary: 'Toggle "accepting bookings" (vacation mode)',
    description: 'Self-service — only available once the profile is APPROVED.',
  })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  async setAvailability(
    @Body() dto: SetAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MasterStatusResponseDto> {
    const master = await this.masters.setAvailability(user.id, dto.isActive);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Patch('instant-book')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({
    summary: 'Opt in/out of auto-accepting bookings (B-24)',
    description:
      'Enabling this alone does not make bookings auto-accept — the master also ' +
      'needs a qualifying `reliabilityScore` (see `GET .../nps` sibling stats). ' +
      'Both are checked at booking-creation time.',
  })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  async setInstantBook(
    @Body() dto: SetInstantBookDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MasterStatusResponseDto> {
    const master = await this.masters.setInstantBook(user.id, dto.enabled);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Get('nps')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s own NPS breakdown (MASTER_PROMPT.md §6.1)' })
  @ApiOkResponse({ type: MasterNpsResponseDto })
  async nps(@CurrentUser() user: AuthenticatedUser): Promise<MasterNpsResponseDto> {
    return this.masters.getOwnNps(user.id);
  }

  @Get('categories')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s attached category ids' })
  @ApiOkResponse({ type: String, isArray: true })
  async categories(@CurrentUser() user: AuthenticatedUser): Promise<string[]> {
    return this.masters.listCategoryIds(user.id);
  }

  @Post('categories')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Attach a leaf category', description: 'Idempotent.' })
  @ApiNoContentResponse()
  @ApiUnprocessableEntityResponse({ description: 'CATEGORY_NOT_LEAF', type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND', type: ErrorResponseDto })
  async attach(
    @Body() dto: AttachCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.masters.attachCategory(user.id, dto.categoryId);
  }

  @Delete('categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Detach a category', description: 'Idempotent.' })
  @ApiNoContentResponse()
  async detach(
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.masters.detachCategory(user.id, categoryId);
  }

  @Get('certificates')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s certificates' })
  @ApiOkResponse({ type: CertificateResponseDto, isArray: true })
  async certificates(@CurrentUser() user: AuthenticatedUser): Promise<CertificateResponseDto[]> {
    const certificates = await this.masters.listCertificates(user.id);

    return certificates.map((certificate) => CertificateResponseDto.fromEntity(certificate));
  }

  @Post('certificates')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Add a certificate' })
  @ApiCreatedResponse({ type: CertificateResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiNotFoundResponse(NOT_FOUND)
  async addCertificate(
    @Body() dto: CreateCertificateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CertificateResponseDto> {
    const certificate = await this.masters.createCertificate(user.id, dto);

    return CertificateResponseDto.fromEntity(certificate);
  }

  @Delete('certificates/:certificateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Remove a certificate', description: 'Soft delete; idempotent.' })
  @ApiNoContentResponse()
  async removeCertificate(
    @Param('certificateId') certificateId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.masters.removeCertificate(user.id, certificateId);
  }

  @Get('portfolio')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s portfolio images, in display order' })
  @ApiOkResponse({ type: PortfolioImageResponseDto, isArray: true })
  async portfolio(@CurrentUser() user: AuthenticatedUser): Promise<PortfolioImageResponseDto[]> {
    const images = await this.masters.listPortfolioImages(user.id);

    return images.map((image) => PortfolioImageResponseDto.fromEntity(image));
  }

  @Post('portfolio')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Add a work-showcase photo (B-45)' })
  @ApiCreatedResponse({ type: PortfolioImageResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION_FAILED | PORTFOLIO_LIMIT_EXCEEDED',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse(NOT_FOUND)
  async addPortfolioImage(
    @Body() dto: CreatePortfolioImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PortfolioImageResponseDto> {
    const image = await this.masters.addPortfolioImage(user.id, dto);

    return PortfolioImageResponseDto.fromEntity(image);
  }

  @Put('portfolio/order')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Reorder the caller’s portfolio images' })
  @ApiOkResponse({ type: PortfolioImageResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'PORTFOLIO_IMAGE_NOT_FOUND', type: ErrorResponseDto })
  async reorderPortfolio(
    @Body() dto: ReorderPortfolioDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PortfolioImageResponseDto[]> {
    const images = await this.masters.reorderPortfolio(user.id, dto.imageIds);

    return images.map((image) => PortfolioImageResponseDto.fromEntity(image));
  }

  @Delete('portfolio/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Remove a portfolio image', description: 'Soft delete; idempotent.' })
  @ApiNoContentResponse()
  async removePortfolioImage(
    @Param('imageId') imageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.masters.removePortfolioImage(user.id, imageId);
  }

  @Get('pricing-suggestion')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({
    summary: 'A market-rate price suggestion for a category (B-41-adjacent)',
    description:
      'Drawn from other masters’ active service prices in the caller’s own city, ' +
      'falling back to a category-wide sample when the city has too few listings.',
  })
  @ApiOkResponse({ type: PricingSuggestionResponseDto })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND', type: ErrorResponseDto })
  async pricingSuggestionFor(
    @Query() query: PricingSuggestionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PricingSuggestionResponseDto> {
    return this.pricingSuggestion.suggest(user.id, query.categoryId);
  }

  @Get('recently-viewed')
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({
    summary: 'The caller’s recently viewed master profiles',
    description:
      'CLIENT only — the one route on this "Master Cabinet" controller a client ' +
      'calls, kept here rather than a new controller so it stays registered ahead ' +
      "of the `masters/:id` wildcard (see MastersModule's route-order note).",
  })
  @ApiOkResponse({ type: MasterPublicResponseDto, isArray: true })
  async recentlyViewedMasters(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentLocale() locale: Locale,
  ): Promise<MasterPublicResponseDto[]> {
    return this.recentlyViewed.list(user.id, locale);
  }
}
