import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { Audit } from '../../audit/decorators/audit.decorator';
import { AdminCertificateQueryDto } from '../dto/requests/admin-certificate-query.dto';
import { AdminCertificateResponseDto } from '../dto/responses/admin-certificate.response.dto';
import { AdminCertificatesService } from '../services/admin-certificates.service';

const NOT_FOUND = { description: 'CERTIFICATE_NOT_FOUND', type: ErrorResponseDto };

/** §6.17 (MASTER_PROMPT.md). */
@ApiTags('Admin')
@Controller('admin/certificates')
export class AdminCertificatesController {
  constructor(private readonly certificates: AdminCertificatesService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List certificates for moderation',
    description: '`verified=false` (default view) surfaces the moderation queue.',
  })
  @ApiPaginatedResponse(AdminCertificateResponseDto)
  async list(
    @Query() query: AdminCertificateQueryDto,
  ): Promise<PaginatedDto<AdminCertificateResponseDto>> {
    const { items, total } = await this.certificates.list(query);

    return PaginatedDto.from(
      items.map((item) => AdminCertificateResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.CERTIFICATE_VERIFIED, 'Certificate')
  @ApiOperation({ summary: 'Verify a certificate' })
  @ApiOkResponse({ type: AdminCertificateResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async verify(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<AdminCertificateResponseDto> {
    const certificate = await this.certificates.verify(id, admin.id);

    return AdminCertificateResponseDto.fromEntity(certificate);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.CERTIFICATE_REJECTED, 'Certificate')
  @ApiOperation({
    summary: 'Reject a certificate',
    description: 'Soft-deletes it — the same effect as the master removing it themselves.',
  })
  @ApiOkResponse({ type: AdminCertificateResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async reject(@Param('id') id: string): Promise<AdminCertificateResponseDto> {
    const certificate = await this.certificates.reject(id);

    return AdminCertificateResponseDto.fromEntity(certificate);
  }
}
