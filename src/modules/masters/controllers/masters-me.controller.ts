import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { AttachCategoryDto } from '../dto/requests/attach-category.dto';
import { CreateCertificateDto } from '../dto/requests/create-certificate.dto';
import { CertificateResponseDto } from '../dto/responses/certificate.response.dto';
import { MasterStatusResponseDto } from '../dto/responses/master-status.response.dto';
import { MastersService } from '../services/masters.service';

const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };
const NOT_FOUND = { description: 'MASTER_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Master Cabinet')
@Controller('masters/me')
export class MastersMeController {
  constructor(private readonly masters: MastersService) {}

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
}
