import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Skills')
@Controller({ path: 'skills', version: '1' })
@UseGuards(JwtAuthGuard)
export class SkillsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all available skills' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Skills retrieved' })
  async findAll() {
    const prisma = this.prisma as PrismaService & {
      skill: {
        findMany: (args: {
          orderBy: { name: 'asc' };
          select: { id: true; name: true };
        }) => Promise<Array<{ id: string; name: string }>>;
      };
    };

    const skills = await prisma.skill.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    return { data: skills };
  }
}
