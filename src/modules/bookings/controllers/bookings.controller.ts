import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import { Idempotent } from '@modules/idempotency/decorators/idempotent.decorator';

import { CancelBookingDto } from '../dto/requests/cancel-booking.dto';
import { CreateBookingDto } from '../dto/requests/create-booking.dto';
import { ListBookingsQueryDto } from '../dto/requests/list-bookings-query.dto';
import { RejectBookingDto } from '../dto/requests/reject-booking.dto';
import { BookingDetailResponseDto } from '../dto/responses/booking-detail.response.dto';
import { BookingResponseDto } from '../dto/responses/booking.response.dto';
import { BookingTransitionService } from '../services/booking-transition.service';
import { BookingsService } from '../services/bookings.service';

const BOOKING_NOT_FOUND = { description: 'BOOKING_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly transitions: BookingTransitionService,
  ) {}

  @Post()
  @Idempotent()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Request a booking',
    description:
      'FR-7.1 — six pre-conditions. An optional `Idempotency-Key` header (Phase 6) ' +
      'makes a retried request replay the original response instead of creating a ' +
      'second booking.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Client-generated value; replaying it returns the original response.',
  })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiNotFoundResponse({ description: 'MASTER_NOT_FOUND', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'SERVICE_INVALID | SLOT_TOO_SOON',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'MASTER_UNAVAILABLE | SLOT_NOT_AVAILABLE | CLIENT_SLOT_CONFLICT | ' +
      'IDEMPOTENCY_KEY_REUSED | IDEMPOTENCY_KEY_IN_PROGRESS',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({ description: 'TOO_MANY_PENDING_BOOKINGS', type: ErrorResponseDto })
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookings.create(user.id, dto);
    return BookingResponseDto.fromEntity(booking, user.role);
  }

  @Get()
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER)
  @ApiOperation({ summary: 'List the caller’s own bookings' })
  @ApiPaginatedResponse(BookingResponseDto)
  async list(
    @Query() query: ListBookingsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<BookingResponseDto>> {
    const { items, total } =
      user.role === UserRole.CLIENT
        ? await this.bookings.listForClient(user.id, query)
        : await this.bookings.listForMaster(user.id, query);

    return PaginatedDto.from(
      items.map((item) => BookingResponseDto.fromEntity(item, user.role)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Booking detail with status history' })
  @ApiOkResponse({ type: BookingDetailResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingDetailResponseDto> {
    const { booking, history } = await this.bookings.getForCaller(user, id);
    return BookingDetailResponseDto.fromEntityWithHistory(booking, history, user.role);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Accept a pending booking', description: 'FR-7.2 — SERIALIZABLE.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  @ApiConflictResponse({
    description: 'ILLEGAL_BOOKING_TRANSITION | BOOKING_OVERLAP',
    type: ErrorResponseDto,
  })
  async accept(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.transitions.accept(user.id, id);
    return BookingResponseDto.fromEntity(booking, user.role);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Reject a pending booking' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  @ApiConflictResponse({ description: 'ILLEGAL_BOOKING_TRANSITION', type: ErrorResponseDto })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.transitions.reject(user.id, id, dto.reason);
    return BookingResponseDto.fromEntity(booking, user.role);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER)
  @ApiOperation({ summary: 'Cancel a booking', description: 'Reason mandatory for the master.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  @ApiUnprocessableEntityResponse({ description: 'REASON_REQUIRED', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'ILLEGAL_BOOKING_TRANSITION', type: ErrorResponseDto })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.transitions.cancel(
      { userId: user.id, role: user.role },
      id,
      dto.reason,
    );
    return BookingResponseDto.fromEntity(booking, user.role);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Start a booking', description: 'Not earlier than 30 minutes before.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  @ApiUnprocessableEntityResponse({ description: 'TOO_EARLY_TO_START', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'ILLEGAL_BOOKING_TRANSITION', type: ErrorResponseDto })
  async start(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.transitions.start(user.id, id);
    return BookingResponseDto.fromEntity(booking, user.role);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Complete a booking' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  @ApiConflictResponse({ description: 'ILLEGAL_BOOKING_TRANSITION', type: ErrorResponseDto })
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.transitions.complete(user.id, id);
    return BookingResponseDto.fromEntity(booking, user.role);
  }
}
