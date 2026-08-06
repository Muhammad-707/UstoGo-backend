import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { CurrentLocale } from '@common/decorators/locale.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import type { Locale } from '@common/utils/locale.util';

import { LeaderboardQueryDto } from '../dto/requests/leaderboard-query.dto';
import { MasterCertificatePublicResponseDto } from '../dto/responses/master-certificate-public.response.dto';
import { MasterLeaderboardEntryDto } from '../dto/responses/master-leaderboard-entry.response.dto';
import { MasterMediaResponseDto } from '../dto/responses/master-media.response.dto';
import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterLeaderboardService } from '../services/master-leaderboard.service';
import { MastersSearchService } from '../services/masters-search.service';
import { RecentlyViewedService } from '../services/recently-viewed.service';

/**
 * Public `masters/:id/*` profile routes.
 *
 * ROUTE ORDER MATTERS (Express first-match-wins): this controller must be
 * registered AFTER every `masters/me/*` controller, otherwise `/masters/me/services`
 * (etc.) is swallowed by `:id/services` with `id = "me"` and explodes on the UUID
 * cast. `MastersMeController` is therefore listed before this controller in
 * `MastersModule.controllers`, and the `/masters/:id/services` + `/masters/:id/schedule`
 * routes live in `ServicesModule` / `ScheduleModule` (see `PublicServicesController`
 * and `PublicScheduleController`), which are scanned before `MastersModule`.
 *
 * `GET /masters` (search & filter) lives in `SearchModule` — see `SearchController`.
 */
@ApiTags('Masters')
@Controller('masters')
export class MastersController {
  constructor(
    private readonly search: MastersSearchService,
    private readonly recentlyViewed: RecentlyViewedService,
    private readonly leaderboard: MasterLeaderboardService,
  ) {}

  /**
   * Registered BEFORE `:id` on purpose — Express/Nest first-match-wins, and
   * `leaderboard` would otherwise be swallowed by the `:id` wildcard below
   * (id="leaderboard", exploding on the UUID cast in `getPublicProfile`).
   */
  @Get('leaderboard')
  @Public()
  @ApiOperation({ summary: 'Top masters by rating, with earned badges' })
  @ApiOkResponse({ type: MasterLeaderboardEntryDto, isArray: true })
  async leaderboardList(
    @Query() query: LeaderboardQueryDto,
    @CurrentLocale() locale: Locale,
  ): Promise<MasterLeaderboardEntryDto[]> {
    return this.leaderboard.list(query, locale);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'A master’s public profile' })
  @ApiOkResponse({ type: MasterPublicResponseDto })
  async byId(
    @Param('id') id: string,
    @CurrentLocale() locale: Locale,
  ): Promise<MasterPublicResponseDto> {
    return this.search.getPublicProfile(id, locale);
  }

  @Get(':id/media')
  @Public()
  @ApiOperation({ summary: 'A master’s avatar, banner and portfolio as short-lived URLs' })
  @ApiOkResponse({ type: MasterMediaResponseDto })
  async media(@Param('id') id: string): Promise<MasterMediaResponseDto> {
    return this.search.getPublicMedia(id);
  }

  @Get(':id/certificates')
  @Public()
  @ApiOperation({ summary: 'A master’s visible certificates' })
  @ApiOkResponse({ type: MasterCertificatePublicResponseDto, isArray: true })
  async certificates(@Param('id') id: string): Promise<MasterCertificatePublicResponseDto[]> {
    return this.search.getPublicCertificates(id);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Record that the caller viewed this profile',
    description: 'Feeds `GET /masters/me/recently-viewed`. Idempotent — bumps `viewedAt`.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'MASTER_NOT_FOUND', type: ErrorResponseDto })
  async recordView(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.recentlyViewed.recordView(user.id, id);
  }
}
