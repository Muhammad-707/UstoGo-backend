import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { MasterServiceResponseDto } from '@modules/masters/dto/responses/master-service.response.dto';
import { MastersSearchService } from '@modules/masters/services/masters-search.service';

/**
 * Public `GET /masters/:id/services`.
 *
 * Lives here — NOT in `MastersController` — so that `ServicesController`'s
 * `masters/me/services` route is registered first (Express first-match-wins);
 * otherwise `/masters/me/services` would be caught by `:id/services` with
 * `id = "me"` and die on the UUID cast. `ServicesModule` is imported before
 * `MastersModule` in `AppModule` for the same reason.
 */
@ApiTags('Masters')
@Controller('masters/:id/services')
export class PublicServicesController {
  constructor(private readonly search: MastersSearchService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'A master’s active services' })
  @ApiOkResponse({ type: MasterServiceResponseDto, isArray: true })
  async list(@Param('id') id: string): Promise<MasterServiceResponseDto[]> {
    return this.search.getActiveServices(id);
  }
}
