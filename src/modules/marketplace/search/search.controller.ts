import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchMentorsQueryDto } from './dto/search-mentors-query.dto';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Marketplace - Search & Discovery')
@Controller({ version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('mentors')
  @ApiOperation({ summary: 'Public mentor directory search' })
  @ApiResponse({ status: 200, description: 'Mentors retrieved' })
  async searchMentors(@Query() query: SearchMentorsQueryDto) {
    const data = await this.searchService.searchMentors(query);
    return { data };
  }

  @Public()
  @Get('mentors/:slugOrId')
  @ApiOperation({ summary: 'Public single mentor profile detail' })
  @ApiResponse({ status: 200, description: 'Mentor profile retrieved' })
  async getMentorProfile(@Param('slugOrId') slugOrId: string) {
    const data = await this.searchService.getMentorBySlugOrId(slugOrId);
    return { data };
  }
}
