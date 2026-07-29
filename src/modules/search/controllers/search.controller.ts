import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { Public } from '@common/decorators/public.decorator';
import { PaginatedDto } from '@common/dto/paginated.dto';
import { MasterSearchQueryDto } from '@modules/masters/dto/requests/master-search-query.dto';
import { MasterPublicResponseDto } from '@modules/masters/dto/responses/master-public.response.dto';

import { SearchService } from '../services/search.service';

@ApiTags('Masters')
@Controller('masters')
export class SearchController {
  constructor(private readonly search: SearchService) {}

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
}
