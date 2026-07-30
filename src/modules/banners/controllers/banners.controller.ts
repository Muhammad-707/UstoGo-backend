import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';

import { PublicBannersQueryDto } from '../dto/requests/public-banners-query.dto';
import { BannerResponseDto } from '../dto/responses/banner.response.dto';
import { BannersService } from '../services/banners.service';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Currently active banners',
    description:
      'Public. Filters to isActive banners whose window covers the current instant ' +
      '(DATABASE.md §12), ordered by sortOrder. Optionally scoped to one position.',
  })
  @ApiOkResponse({ type: BannerResponseDto, isArray: true })
  async list(@Query() query: PublicBannersQueryDto): Promise<BannerResponseDto[]> {
    const banners = await this.banners.listPublic(query.position);

    return banners.map((banner) => BannerResponseDto.fromEntity(banner));
  }
}
