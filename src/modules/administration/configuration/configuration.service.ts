import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export const DEFAULT_PLATFORM_SETTINGS: Record<string, { value: string; description: string }> = {
  global_commission_rate: {
    value: '15',
    description: 'Platform commission percentage retained from each completed session/mentorship (0-100%)',
  },
  min_payout_amount: {
    value: '10000',
    description: 'Minimum balance in XAF required for a mentor to submit a withdrawal request',
  },
  auto_cancel_hours: {
    value: '24',
    description: 'Hours before scheduled session start time after which cancellations incur penalty or are restricted',
  },
  dispute_grace_period_days: {
    value: '7',
    description: 'Window in days after a session finishes during which a mentee can raise a dispute',
  },
  support_email: {
    value: 'support@mentoraura.com',
    description: 'Primary platform customer support and dispute escalation email',
  },
  terms_url: {
    value: 'https://mentoraura.com/terms',
    description: 'Public link to current Terms of Service',
  },
  privacy_url: {
    value: 'https://mentoraura.com/privacy',
    description: 'Public link to current Privacy Policy',
  },
};

@Injectable()
export class ConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const records = await this.prisma.platformSetting.findMany();
    const map: Record<string, { value: string; description: string; updatedAt: Date }> = {};

    // Seed defaults in map
    for (const [k, v] of Object.entries(DEFAULT_PLATFORM_SETTINGS)) {
      map[k] = {
        value: v.value,
        description: v.description,
        updatedAt: new Date(),
      };
    }

    // Overlay database settings
    for (const r of records) {
      map[r.key] = {
        value: r.value,
        description: r.description || DEFAULT_PLATFORM_SETTINGS[r.key]?.description || '',
        updatedAt: r.updatedAt,
      };
    }

    return map;
  }

  async updateSettings(
    adminId: string,
    settings: Record<string, string>,
    ipAddress?: string,
  ) {
    const updatedEntries: { key: string; value: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(settings)) {
        if (value === undefined || value === null) continue;

        const stringVal = String(value).trim();
        const desc = DEFAULT_PLATFORM_SETTINGS[key]?.description || 'Custom platform setting';

        const record = await tx.platformSetting.upsert({
          where: { key },
          create: {
            key,
            value: stringVal,
            description: desc,
            updatedBy: adminId,
          },
          update: {
            value: stringVal,
            updatedBy: adminId,
          },
        });

        updatedEntries.push({ key: record.key, value: record.value });
      }

      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: 'UPDATE_PLATFORM_SETTINGS',
          targetId: adminId,
          details: {
            targetType: 'PLATFORM_SETTINGS',
            updatedKeys: Object.keys(settings),
            newValues: settings,
          },
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    });

    return {
      message: 'Platform settings updated successfully',
      updated: updatedEntries,
    };
  }

  // --- Category Management ---

  async getCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { mentorCategories: true },
        },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      mentorCount: c._count.mentorCategories,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createCategory(
    adminId: string,
    dto: { name: string; description?: string },
    ipAddress?: string,
  ) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Category name is required');
    }

    const name = dto.name.trim();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const existing = await this.prisma.category.findFirst({
      where: { OR: [{ name }, { slug }] },
    });

    if (existing) {
      throw new BadRequestException(`Category with name or slug '${name}' already exists`);
    }

    const category = await this.prisma.category.create({
      data: {
        name,
        slug,
        description: dto.description || null,
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'CREATE_CATEGORY',
        targetId: category.id,
        details: { targetType: 'CATEGORY', name: category.name, slug: category.slug },
        ipAddress: ipAddress || '127.0.0.1',
      },
    });

    return category;
  }

  async updateCategory(
    adminId: string,
    id: string,
    dto: { name?: string; description?: string },
    ipAddress?: string,
  ) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const data: { name?: string; slug?: string; description?: string } = {};

    if (dto.name) {
      const name = dto.name.trim();
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Check collision
      const collision = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          OR: [{ name }, { slug }],
        },
      });

      if (collision) {
        throw new BadRequestException(`Another category with name '${name}' already exists`);
      }

      data.name = name;
      data.slug = slug;
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data,
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'UPDATE_CATEGORY',
        targetId: id,
        details: { targetType: 'CATEGORY', previous: { name: category.name }, updated: data },
        ipAddress: ipAddress || '127.0.0.1',
      },
    });

    return updated;
  }

  async deleteCategory(adminId: string, id: string, ipAddress?: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { mentorCategories: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    if (category._count.mentorCategories > 0) {
      throw new BadRequestException(
        `Cannot delete category '${category.name}' because it has ${category._count.mentorCategories} active mentor(s) assigned. Reassign them first.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'DELETE_CATEGORY',
        targetId: id,
        details: { targetType: 'CATEGORY', name: category.name },
        ipAddress: ipAddress || '127.0.0.1',
      },
    });

    return { message: `Category '${category.name}' deleted successfully` };
  }
}
