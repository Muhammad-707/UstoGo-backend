import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { Public } from '@common/decorators/public.decorator';
import { PaginatedDto } from '@common/dto/paginated.dto';

import { MasterSearchQueryDto } from '../dto/requests/master-search-query.dto';
import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterServiceResponseDto } from '../dto/responses/master-service.response.dto';
import { MastersSearchService } from '../services/masters-search.service';

@ApiTags('Masters')
@Controller('masters')
export class MastersController {
  constructor(private readonly search: MastersSearchService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Search and filter approved masters',
    description: 'Public. Approved, active, non-deleted masters only (API.md §7).',
  })
  @ApiPaginatedResponse(MasterPublicResponseDto)
  async list(@Query() query: MasterSearchQueryDto): Promise<PaginatedDto<MasterPublicResponseDto>> {
    const { items, total } = await this.search.search(query);

    return PaginatedDto.from(items, total, query.page, query.limit);
  }

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
