import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';

import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterServiceResponseDto } from '../dto/responses/master-service.response.dto';
import { MastersSearchService } from '../services/masters-search.service';

/** `GET /masters` (search & filter) lives in `SearchModule` — see `SearchController`. */
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

  @Get(':id/services')
  @Public()
  @ApiOperation({ summary: 'A master’s active services' })
  @ApiOkResponse({ type: MasterServiceResponseDto, isArray: true })
  async services(@Param('id') id: string): Promise<MasterServiceResponseDto[]> {
    return this.search.getActiveServices(id);
  }
}
