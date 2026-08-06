import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';

import { CompletionCertificateResponseDto } from '../dto/responses/completion-certificate.response.dto';
import { CompletionCertificateService } from '../services/completion-certificate.service';

/**
 * Public certificate verification — anti-fraud proof that a job was really
 * completed on-platform. Deliberately unauthenticated: the whole point is that
 * anyone who scans the QR (a prospective client, say) can verify it without an
 * UstoGo account.
 */
@ApiTags('Bookings')
@Controller('certificates')
export class CertificateVerificationController {
  constructor(private readonly certificates: CompletionCertificateService) {}

  @Get('verify/:code')
  @Public()
  @ApiOperation({ summary: 'Verify a completion certificate by its code' })
  @ApiOkResponse({ type: CompletionCertificateResponseDto })
  @ApiNotFoundResponse({ description: 'COMPLETION_CERTIFICATE_NOT_FOUND', type: ErrorResponseDto })
  async verify(@Param('code') code: string): Promise<CompletionCertificateResponseDto> {
    return this.certificates.verify(code);
  }
}
