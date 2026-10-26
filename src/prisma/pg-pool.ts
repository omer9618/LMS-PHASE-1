import { Pool } from 'pg';

/**
 * The pg Pool behind PrismaPg. Used by PrismaService and prisma/seed.ts so both connect the same way.
 *
 * TimeZone=UTC is required for correctness, not style: @prisma/adapter-pg sends DateTime values
 * as UTC wall-clock strings with no offset, and drops the offset when reading timestamptz back.
 * With any other session time zone, Postgres would store the wrong instant (e.g. +05 under
 * Asia/Karachi) while Prisma's own round trip still looked right.
 */
export function createPgPool(connectionString: string): Pool {
  return new Pool({ connectionString, options: '-c TimeZone=UTC' });
}
