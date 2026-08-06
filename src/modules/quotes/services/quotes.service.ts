import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalStatus, Prisma, QuoteStatus, UserRole } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import {
  BusinessRuleViolationException,
  ConflictException,
  ResourceNotFoundException,
} from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { CreateQuoteDto } from '../dto/requests/create-quote.dto';
import type { DeclineQuoteDto } from '../dto/requests/decline-quote.dto';
import type { ListQuotesQueryDto } from '../dto/requests/list-quotes-query.dto';
import type { RespondQuoteDto } from '../dto/requests/respond-quote.dto';
import {
  QUOTE_EVENT,
  QuoteDeclinedEvent,
  QuoteRequestedEvent,
  QuoteRespondedEvent,
} from '../events/quote.events';
import {
  QuoteAlreadyRespondedException,
  QuoteNotFoundException,
} from '../exceptions/quotes.exceptions';

const QUOTE_INCLUDE = {
  masterProfile: { select: { displayName: true, user: { select: { id: true } } } },
  clientProfile: { select: { firstName: true, lastName: true, user: { select: { id: true } } } },
  service: { select: { title: true } },
} satisfies Prisma.QuoteInclude;

export type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof QUOTE_INCLUDE }>;

/**
 * B-44 (MODULES.md › QuotesModule). A client's pre-booking price inquiry — "how much
 * would this cost?" — independent of `Booking`. Follows `ReportsService`'s shape: one
 * flat model, no state machine, a request/response pair of actions.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateQuoteDto): Promise<QuoteRow> {
    const clientProfileId = await this.clientProfileIdFor(userId);
    await this.assertMasterAvailable(dto.masterId);
    if (dto.serviceId !== undefined) {
      await this.assertServiceBelongsToMaster(dto.serviceId, dto.masterId);
    }

    const quote = await this.prisma.db.quote.create({
      data: {
        clientProfileId,
        masterProfileId: dto.masterId,
        ...(dto.serviceId !== undefined ? { serviceId: dto.serviceId } : {}),
        description: dto.description,
      },
      include: QUOTE_INCLUDE,
    });

    this.events.emit(
      QUOTE_EVENT.REQUESTED,
      new QuoteRequestedEvent(
        quote.id,
        quote.masterProfile.user.id,
        `${quote.clientProfile.firstName} ${quote.clientProfile.lastName}`,
      ),
    );

    return quote;
  }

  async respond(masterUserId: string, quoteId: string, dto: RespondQuoteDto): Promise<QuoteRow> {
    const masterProfileId = await this.masterProfileIdFor(masterUserId);
    const existing = await this.findOwnedByMaster(quoteId, masterProfileId);
    if (existing.status !== QuoteStatus.PENDING) {
      throw new QuoteAlreadyRespondedException();
    }

    const quote = await this.prisma.db.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.RESPONDED,
        estimatedPrice: dto.estimatedPrice,
        priceType: dto.priceType,
        masterNote: dto.note ?? null,
        respondedAt: new Date(),
      },
      include: QUOTE_INCLUDE,
    });

    this.events.emit(
      QUOTE_EVENT.RESPONDED,
      new QuoteRespondedEvent(
        quote.id,
        quote.clientProfile.user.id,
        quote.masterProfile.displayName,
        dto.estimatedPrice.toFixed(2),
      ),
    );

    return quote;
  }

  async decline(masterUserId: string, quoteId: string, dto: DeclineQuoteDto): Promise<QuoteRow> {
    const masterProfileId = await this.masterProfileIdFor(masterUserId);
    const existing = await this.findOwnedByMaster(quoteId, masterProfileId);
    if (existing.status !== QuoteStatus.PENDING) {
      throw new QuoteAlreadyRespondedException();
    }

    const quote = await this.prisma.db.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.DECLINED, declineReason: dto.reason, respondedAt: new Date() },
      include: QUOTE_INCLUDE,
    });

    this.events.emit(
      QUOTE_EVENT.DECLINED,
      new QuoteDeclinedEvent(
        quote.id,
        quote.clientProfile.user.id,
        quote.masterProfile.displayName,
        dto.reason,
      ),
    );

    return quote;
  }

  /** Participants and admins only — a non-participant gets 404, never 403. */
  async getForCaller(caller: { id: string; role: UserRole }, quoteId: string): Promise<QuoteRow> {
    const quote = await this.prisma.db.quote.findUnique({
      where: { id: quoteId },
      include: QUOTE_INCLUDE,
    });
    if (quote === null) {
      throw new QuoteNotFoundException();
    }

    const isParticipant =
      caller.role === UserRole.ADMIN ||
      quote.masterProfile.user.id === caller.id ||
      quote.clientProfile.user.id === caller.id;
    if (!isParticipant) {
      throw new QuoteNotFoundException();
    }

    return quote;
  }

  async listForClient(
    userId: string,
    query: ListQuotesQueryDto,
  ): Promise<{ items: QuoteRow[]; total: number }> {
    const clientProfileId = await this.clientProfileIdFor(userId);
    return this.list({ clientProfileId }, query);
  }

  async listForMaster(
    userId: string,
    query: ListQuotesQueryDto,
  ): Promise<{ items: QuoteRow[]; total: number }> {
    const masterProfileId = await this.masterProfileIdFor(userId);
    return this.list({ masterProfileId }, query);
  }

  private async list(
    scope: { clientProfileId?: string; masterProfileId?: string },
    query: ListQuotesQueryDto,
  ): Promise<{ items: QuoteRow[]; total: number }> {
    const where: Prisma.QuoteWhereInput = {
      ...scope,
      ...(query.status !== undefined ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.quote.findMany({
        where,
        include: QUOTE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.quote.count({ where }),
    ]);

    return { items, total };
  }

  private async findOwnedByMaster(quoteId: string, masterProfileId: string): Promise<QuoteRow> {
    const quote = await this.prisma.db.quote.findFirst({
      where: { id: quoteId, masterProfileId },
      include: QUOTE_INCLUDE,
    });
    if (quote === null) {
      throw new QuoteNotFoundException();
    }
    return quote;
  }

  private async assertMasterAvailable(masterId: string): Promise<void> {
    const master = await this.prisma.db.masterProfile.findUnique({ where: { id: masterId } });
    if (master === null) {
      throw new ResourceNotFoundException(
        ERROR_CODE.MASTER_NOT_FOUND,
        'That master does not exist.',
      );
    }
    if (master.approvalStatus !== ApprovalStatus.APPROVED || !master.isActive) {
      throw new ConflictException(
        ERROR_CODE.MASTER_UNAVAILABLE,
        'That master is not currently accepting bookings.',
      );
    }
  }

  private async assertServiceBelongsToMaster(serviceId: string, masterId: string): Promise<void> {
    const service = await this.prisma.db.service.findFirst({
      where: { id: serviceId, masterProfileId: masterId, isActive: true },
    });
    if (service === null) {
      throw new BusinessRuleViolationException(
        ERROR_CODE.SERVICE_INVALID,
        'That service is not offered by this master, or is no longer active.',
      );
    }
  }

  private async clientProfileIdFor(userId: string): Promise<string> {
    const client = await this.prisma.db.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (client === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }
    return client.id;
  }

  private async masterProfileIdFor(userId: string): Promise<string> {
    const master = await this.prisma.db.masterProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (master === null) {
      throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.');
    }
    return master.id;
  }
}
