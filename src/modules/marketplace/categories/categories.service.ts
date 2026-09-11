import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

const DEFAULT_CATEGORIES = [
  {
    name: 'Engineering',
    slug: 'engineering',
    description: 'Software engineering, system design, and web development',
  },
  {
    name: 'Product Management',
    slug: 'product',
    description: 'Product strategy, roadmap execution, and user research',
  },
  {
    name: 'Design & UX',
    slug: 'design',
    description: 'UI/UX design, visual design, and user experience research',
  },
  {
    name: 'AI & Data Science',
    slug: 'ai-data',
    description: 'Machine learning, data analysis, and AI engineering',
  },
  {
    name: 'Career Growth',
    slug: 'career',
    description: 'Career transitions, resume reviews, and interview prep',
  },
  {
    name: 'Leadership & Exec',
    slug: 'leadership',
    description:
      'Engineering management, team leadership, and executive coaching',
  },
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultCategories();
  }

  async seedDefaultCategories() {
    try {
      const count = await this.prisma.category.count();
      if (count === 0) {
        for (const cat of DEFAULT_CATEGORIES) {
          await this.prisma.category.upsert({
            where: { slug: cat.slug },
            update: {},
            create: cat,
          });
        }
      }
    } catch {
      // Ignore seeding errors on init if DB is not ready
    }
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    if (categories.length === 0) {
      await this.seedDefaultCategories();
      return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    }
    return categories;
  }
}
