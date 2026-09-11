import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Marketplace - Discovery')
@Controller({ path: 'discovery', version: '1' })
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'Get featured mentors for homepage' })
  @ApiResponse({ status: 200, description: 'Featured mentors retrieved' })
  async getFeatured() {
    const data = await this.discoveryService.getFeaturedMentors();
    return { data };
  }
}
