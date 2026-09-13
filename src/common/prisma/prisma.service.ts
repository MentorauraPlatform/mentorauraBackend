import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            process.env.DIRECT_URL ||
            'postgresql://postgres.opopvxzurkuqilzctser:mentoraurapasswor@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      console.warn(
        'Prisma initial $connect failed, lazy connecting on first query:',
        err,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
