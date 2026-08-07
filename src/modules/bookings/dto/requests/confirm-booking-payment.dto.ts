import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * `POST /bookings/:id/confirm-payment`. `paidAmount` is what the client says actually
 * changed hands off-platform (ADR-8) — equal to `price` (paid in full), less (and then
 * `note` is required — enforced in `BookingPaymentService`, since only it has the
 * booking's `price` to compare against), or more (a tip, `note` optional).
 */
export class ConfirmBookingPaymentDto {
  @ApiProperty({ minimum: 0, maximum: 99999999.99, example: 150 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  paidAmount!: number;

  @ApiPropertyOptional({
    minLength: 10,
    maxLength: 500,
    description: 'Required when paidAmount is less than the agreed price.',
  })
  @IsOptional()
  @IsString()
  @Length(10, 500)
  note?: string;
}
