import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ActorType,
  BookingStatus,
  CancellationReasonCode,
  PriceType,
  UserRole,
} from '@prisma/client';

export type BookingWithParties = {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  masterProfileId: string;
  clientProfileId: string;
  serviceId: string;
  serviceTitle: string;
  price: { toFixed: (n: number) => string };
  priceType: PriceType;
  currency: string;
  scheduledAt: Date;
  endsAt: Date;
  durationMinutes: number;
  addressLine: string;
  addressDistrict: string;
  cityId: string | null;
  contactPhone: string | null;
  latitude: { toNumber: () => number } | null;
  longitude: { toNumber: () => number } | null;
  clientNote: string | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancellationReasonCode: CancellationReasonCode | null;
  cancelledByType: ActorType | null;
  isLateCancellation: boolean;
  rescheduleCount: number;
  paidAmount: { toFixed: (n: number) => string } | null;
  paymentNote: string | null;
  paymentConfirmedAt: Date | null;
  createdAt: Date;
  masterProfile: {
    displayName: string;
    whatsappPhone: string | null;
    whatsappEnabled: boolean;
  };
  clientProfile: { firstName: string; lastName: string; user: { phone: string | null } };
  attachments: { fileId: string }[];
};

/** Statuses from which the master may see the client's exact contact details (FR-7.6). */
const CONTACT_DISCLOSED_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
];

/**
 * API.md §9. Progressive contact-detail disclosure is enforced here, in the response
 * projection, rather than by omitting fields ad hoc elsewhere — `USER_ROLES.md`:
 * "Cannot see client contact details on a PENDING booking."
 */
export class BookingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'UG-2026-000123' })
  bookingNumber!: string;

  @ApiProperty({ enum: BookingStatus })
  status!: BookingStatus;

  @ApiProperty({ format: 'uuid' })
  masterId!: string;

  @ApiProperty()
  masterDisplayName!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '+992901234567',
    description: 'The master’s WhatsApp number — present only while whatsappEnabled is true (P0).',
  })
  masterWhatsappPhone!: string | null;

  @ApiProperty({ example: true, description: 'Whether the master publishes a WhatsApp line.' })
  masterWhatsappEnabled!: boolean;

  @ApiProperty({ format: 'uuid' })
  clientId!: string;

  @ApiProperty()
  clientName!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Only once the master may see it' })
  clientPhone!: string | null;

  @ApiProperty({ format: 'uuid' })
  serviceId!: string;

  @ApiProperty()
  serviceTitle!: string;

  @ApiProperty()
  price!: string;

  @ApiProperty({ enum: PriceType })
  priceType!: PriceType;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  scheduledAt!: string;

  @ApiProperty()
  endsAt!: string;

  @ApiProperty()
  durationMinutes!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Full address; district-level until accepted',
  })
  addressLine!: string | null;

  @ApiProperty()
  addressDistrict!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  cityId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Contact phone captured at booking time; falls back to the profile phone.',
  })
  contactPhone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  latitude!: number | null;

  @ApiPropertyOptional({ nullable: true })
  longitude!: number | null;

  @ApiPropertyOptional({ nullable: true })
  clientNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancellationReason!: string | null;

  @ApiPropertyOptional({ enum: CancellationReasonCode, nullable: true })
  cancellationReasonCode!: CancellationReasonCode | null;

  @ApiPropertyOptional({ enum: ActorType, nullable: true })
  cancelledByType!: ActorType | null;

  @ApiProperty()
  isLateCancellation!: boolean;

  @ApiProperty({ description: 'B-51: 0 until rescheduled once; capped at 1 in v1.' })
  rescheduleCount!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'What the client says they actually paid, off-platform. Null until confirmed.',
  })
  paidAmount!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Required when paidAmount was less than price.',
  })
  paymentNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paymentConfirmedAt!: string | null;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'B-54: File ids of photos attached at creation. Resolve a URL via GET /files/:id/url.',
  })
  attachmentFileIds!: string[];

  @ApiProperty()
  createdAt!: string;

  static fromEntity(booking: BookingWithParties, viewerRole: UserRole): BookingResponseDto {
    const discloseContact =
      viewerRole !== UserRole.MASTER || CONTACT_DISCLOSED_STATUSES.includes(booking.status);

    const dto = new BookingResponseDto();

    dto.id = booking.id;
    dto.bookingNumber = booking.bookingNumber;
    dto.status = booking.status;
    dto.masterId = booking.masterProfileId;
    dto.masterDisplayName = booking.masterProfile.displayName;
    dto.masterWhatsappEnabled = booking.masterProfile.whatsappEnabled;
    dto.masterWhatsappPhone = booking.masterProfile.whatsappEnabled
      ? booking.masterProfile.whatsappPhone
      : null;
    dto.clientId = booking.clientProfileId;
    dto.clientName = `${booking.clientProfile.firstName} ${booking.clientProfile.lastName}`;
    dto.serviceId = booking.serviceId;
    dto.serviceTitle = booking.serviceTitle;
    dto.price = booking.price.toFixed(2);
    dto.priceType = booking.priceType;
    dto.currency = booking.currency;
    dto.scheduledAt = booking.scheduledAt.toISOString();
    dto.endsAt = booking.endsAt.toISOString();
    dto.durationMinutes = booking.durationMinutes;
    dto.addressDistrict = booking.addressDistrict;
    dto.cityId = booking.cityId;
    dto.clientNote = booking.clientNote;
    dto.cancellationReason = booking.cancellationReason;
    dto.cancellationReasonCode = booking.cancellationReasonCode;
    dto.cancelledByType = booking.cancelledByType;
    dto.isLateCancellation = booking.isLateCancellation;
    dto.rescheduleCount = booking.rescheduleCount;
    dto.attachmentFileIds = booking.attachments.map((attachment) => attachment.fileId);
    dto.createdAt = booking.createdAt.toISOString();

    applyContactFields(dto, booking, discloseContact);
    applyLifecycleTimestamps(dto, booking);
    applyPaymentFields(dto, booking);

    return dto;
  }
}

/** Split out of `fromEntity` to keep its cyclomatic complexity under CODING_STANDARDS.md's cap. */
const applyContactFields = (
  dto: BookingResponseDto,
  booking: BookingWithParties,
  discloseContact: boolean,
): void => {
  dto.contactPhone = discloseContact
    ? (booking.contactPhone ?? booking.clientProfile.user.phone)
    : null;
  dto.clientPhone = dto.contactPhone;
  dto.addressLine = discloseContact ? booking.addressLine : null;
  dto.latitude = discloseContact ? (booking.latitude?.toNumber() ?? null) : null;
  dto.longitude = discloseContact ? (booking.longitude?.toNumber() ?? null) : null;
};

const applyLifecycleTimestamps = (dto: BookingResponseDto, booking: BookingWithParties): void => {
  dto.acceptedAt = booking.acceptedAt?.toISOString() ?? null;
  dto.startedAt = booking.startedAt?.toISOString() ?? null;
  dto.completedAt = booking.completedAt?.toISOString() ?? null;
  dto.cancelledAt = booking.cancelledAt?.toISOString() ?? null;
};

/** Split out of `fromEntity` for the same reason as `applyContactFields`. */
const applyPaymentFields = (dto: BookingResponseDto, booking: BookingWithParties): void => {
  dto.paidAmount = booking.paidAmount?.toFixed(2) ?? null;
  dto.paymentNote = booking.paymentNote;
  dto.paymentConfirmedAt = booking.paymentConfirmedAt?.toISOString() ?? null;
};
