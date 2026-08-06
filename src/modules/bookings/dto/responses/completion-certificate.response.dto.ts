import { ApiProperty } from '@nestjs/swagger';

export class CompletionCertificateResponseDto {
  @ApiProperty({
    example: 'A1B2-C3D4-E5F6',
    description: 'The QR payload / manually-typeable code.',
  })
  verificationCode!: string;

  @ApiProperty({ example: '/api/v1/certificates/verify/A1B2-C3D4-E5F6' })
  verifyPath!: string;

  @ApiProperty()
  issuedAt!: string;

  @ApiProperty({ example: 'UG-2026-000123' })
  bookingNumber!: string;

  @ApiProperty()
  serviceTitle!: string;

  @ApiProperty()
  masterDisplayName!: string;

  @ApiProperty()
  clientName!: string;

  @ApiProperty()
  completedAt!: string;
}
