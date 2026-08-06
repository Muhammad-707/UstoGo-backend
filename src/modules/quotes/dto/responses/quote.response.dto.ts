import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PriceType, QuoteStatus } from '@prisma/client';

export type QuoteWithParties = {
  id: string;
  status: QuoteStatus;
  description: string;
  estimatedPrice: { toFixed: (n: number) => string } | null;
  priceType: PriceType | null;
  masterNote: string | null;
  declineReason: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  masterProfileId: string;
  clientProfileId: string;
  serviceId: string | null;
  masterProfile: { displayName: string };
  clientProfile: { firstName: string; lastName: string };
  service: { title: string } | null;
};

/** API — quote detail as either party sees it. */
export class QuoteResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) masterId!: string;
  @ApiProperty() masterDisplayName!: string;
  @ApiProperty({ format: 'uuid' }) clientId!: string;
  @ApiProperty() clientName!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) serviceId!: string | null;
  @ApiPropertyOptional({ nullable: true }) serviceTitle!: string | null;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ['PENDING', 'RESPONDED', 'DECLINED'] }) status!: QuoteStatus;
  @ApiPropertyOptional({ nullable: true }) estimatedPrice!: string | null;
  @ApiPropertyOptional({ nullable: true }) priceType!: PriceType | null;
  @ApiPropertyOptional({ nullable: true }) masterNote!: string | null;
  @ApiPropertyOptional({ nullable: true }) declineReason!: string | null;
  @ApiPropertyOptional({ nullable: true }) respondedAt!: string | null;
  @ApiProperty() createdAt!: string;

  static fromEntity(quote: QuoteWithParties): QuoteResponseDto {
    return {
      id: quote.id,
      masterId: quote.masterProfileId,
      masterDisplayName: quote.masterProfile.displayName,
      clientId: quote.clientProfileId,
      clientName: `${quote.clientProfile.firstName} ${quote.clientProfile.lastName}`,
      serviceId: quote.serviceId,
      serviceTitle: quote.service?.title ?? null,
      description: quote.description,
      status: quote.status,
      estimatedPrice: quote.estimatedPrice?.toFixed(2) ?? null,
      priceType: quote.priceType,
      masterNote: quote.masterNote,
      declineReason: quote.declineReason,
      respondedAt: quote.respondedAt?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
    };
  }
}
