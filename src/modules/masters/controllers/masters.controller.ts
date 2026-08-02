import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';

import { MasterCertificatePublicResponseDto } from '../dto/responses/master-certificate-public.response.dto';
import { MasterMediaResponseDto } from '../dto/responses/master-media.response.dto';
import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MastersSearchService } from '../services/masters-search.service';

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
  constructor(private readonly search: MastersSearchService) {}

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'A master’s public profile' })
  @ApiOkResponse({ type: MasterPublicResponseDto })
  async byId(@Param('id') id: string): Promise<MasterPublicResponseDto> {
    return this.search.getPublicProfile(id);
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
}
