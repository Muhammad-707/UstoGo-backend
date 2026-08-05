import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { MyReferralResponseDto } from '../dto/responses/my-referral.response.dto';
import { ReferralsService } from '../services/referrals.service';

/** §6.4 (MASTER_PROMPT.md). */
@ApiTags('Referrals')
@Controller('me/referral')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({
    summary: 'The caller’s own referral code, link and reward summary',
    description: 'Generates the code on first call if the client does not have one yet.',
  })
  @ApiOkResponse({ type: MyReferralResponseDto })
  async getMine(@CurrentUser() user: AuthenticatedUser): Promise<MyReferralResponseDto> {
    return this.referrals.getMyReferral(user.id);
  }
}
