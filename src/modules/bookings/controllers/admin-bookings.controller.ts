import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';

import { Audit } from '../../audit/decorators/audit.decorator';
import { ReasonDto } from '../../masters/dto/requests/reason.dto';
import { AdminListBookingsQueryDto } from '../dto/requests/admin-list-bookings-query.dto';
import { BookingDetailResponseDto } from '../dto/responses/booking-detail.response.dto';
import { BookingResponseDto } from '../dto/responses/booking.response.dto';
import { AdminBookingTransitionService } from '../services/admin-booking-transition.service';
import { BookingsService } from '../services/bookings.service';

const BOOKING_NOT_FOUND = { description: 'BOOKING_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly transitions: AdminBookingTransitionService,
  ) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List every booking',
    description: 'Filterable by status, participant, date.',
  })
  @ApiPaginatedResponse(BookingResponseDto)
  async list(@Query() query: AdminListBookingsQueryDto): Promise<PaginatedDto<BookingResponseDto>> {
    const { items, total } = await this.bookings.listForAdmin(query);

    return PaginatedDto.from(
      items.map((item) => BookingResponseDto.fromEntity(item, UserRole.ADMIN)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Booking detail with full status history' })
  @ApiOkResponse({ type: BookingDetailResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  async findOne(@Param('id') id: string): Promise<BookingDetailResponseDto> {
    const booking = await this.bookings.findById(id);
    const history = await this.bookings.findHistory(id);

    return BookingDetailResponseDto.fromEntityWithHistory(booking, history, UserRole.ADMIN);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.BOOKING_FORCE_CANCELLED, 'Booking')
  @ApiOperation({ summary: 'Force-cancel a booking', description: 'Reason mandatory, audited.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  @ApiConflictResponse({ description: 'ILLEGAL_BOOKING_TRANSITION', type: ErrorResponseDto })
  async cancel(@Param('id') id: string, @Body() dto: ReasonDto): Promise<BookingResponseDto> {
    const booking = await this.transitions.cancel(id, dto.reason);
    return BookingResponseDto.fromEntity(booking, UserRole.ADMIN);
  }
}
