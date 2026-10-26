import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { createPgPool } from './pg-pool';

/**
 * The single PrismaClient for the app, connected through the pg driver adapter
 * (same approach as prisma/seed.ts). Only DAOs may inject this.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(ENV) env: Env) {
    const pool = createPgPool(env.DATABASE_URL);
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
