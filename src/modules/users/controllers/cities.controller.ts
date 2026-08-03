import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentLocale } from '@common/decorators/locale.decorator';
import { Public } from '@common/decorators/public.decorator';
import type { Locale } from '@common/utils/locale.util';

import { CityResponseDto } from '../dto/responses/city.response.dto';
import { CitiesService } from '../services/cities.service';

@ApiTags('Users')
@Controller('cities')
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List active cities',
    description:
      'Public — no authentication required. Reference data for the city selectors on ' +
      'registration and profile forms. Returned unpaginated because the whole list is ' +
      'meant to be fetched once and cached; withdrawn cities are omitted but remain in ' +
      'the database so historical rows keep resolving. Localized via the `X-Locale` ' +
      'header (`tj` | `ru` | `en`, defaults to `en`).',
  })
  @ApiOkResponse({ type: CityResponseDto, isArray: true })
  async list(@CurrentLocale() locale: Locale): Promise<CityResponseDto[]> {
    const cities = await this.cities.listActive();

    return cities.map((city) => CityResponseDto.fromEntity(city, locale));
  }
}
