import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { CreateQuoteDto } from '../dto/requests/create-quote.dto';
import { DeclineQuoteDto } from '../dto/requests/decline-quote.dto';
import { ListQuotesQueryDto } from '../dto/requests/list-quotes-query.dto';
import { RespondQuoteDto } from '../dto/requests/respond-quote.dto';
import { QuoteResponseDto } from '../dto/responses/quote.response.dto';
import { QuotesService } from '../services/quotes.service';

const QUOTE_NOT_FOUND = { description: 'QUOTE_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Ask a master for a price estimate before booking (B-44)' })
  @ApiCreatedResponse({ type: QuoteResponseDto })
  @ApiNotFoundResponse({ description: 'MASTER_NOT_FOUND', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'SERVICE_INVALID', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'MASTER_UNAVAILABLE', type: ErrorResponseDto })
  async create(
    @Body() dto: CreateQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteResponseDto> {
    const quote = await this.quotes.create(user.id, dto);
    return QuoteResponseDto.fromEntity(quote);
  }

  @Get()
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER)
  @ApiOperation({ summary: 'List the caller’s own quotes (sent or received)' })
  @ApiPaginatedResponse(QuoteResponseDto)
  async list(
    @Query() query: ListQuotesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<QuoteResponseDto>> {
    const { items, total } =
      user.role === UserRole.CLIENT
        ? await this.quotes.listForClient(user.id, query)
        : await this.quotes.listForMaster(user.id, query);

    return PaginatedDto.from(
      items.map((item) => QuoteResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Quote detail' })
  @ApiOkResponse({ type: QuoteResponseDto })
  @ApiNotFoundResponse(QUOTE_NOT_FOUND)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteResponseDto> {
    const quote = await this.quotes.getForCaller(user, id);
    return QuoteResponseDto.fromEntity(quote);
  }

  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Answer a pending quote with an estimated price' })
  @ApiOkResponse({ type: QuoteResponseDto })
  @ApiNotFoundResponse(QUOTE_NOT_FOUND)
  @ApiConflictResponse({ description: 'QUOTE_ALREADY_RESPONDED', type: ErrorResponseDto })
  async respond(
    @Param('id') id: string,
    @Body() dto: RespondQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteResponseDto> {
    const quote = await this.quotes.respond(user.id, id, dto);
    return QuoteResponseDto.fromEntity(quote);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Decline a pending quote request' })
  @ApiOkResponse({ type: QuoteResponseDto })
  @ApiNotFoundResponse(QUOTE_NOT_FOUND)
  @ApiConflictResponse({ description: 'QUOTE_ALREADY_RESPONDED', type: ErrorResponseDto })
  async decline(
    @Param('id') id: string,
    @Body() dto: DeclineQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteResponseDto> {
    const quote = await this.quotes.decline(user.id, id, dto);
    return QuoteResponseDto.fromEntity(quote);
  }
}
