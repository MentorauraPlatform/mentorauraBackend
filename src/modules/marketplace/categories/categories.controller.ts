import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Marketplace - Categories')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all mentorship categories' })
  @ApiResponse({ status: 200, description: 'Categories retrieved' })
  async findAll() {
    const data = await this.categoriesService.findAll();
    return { data };
  }
}
