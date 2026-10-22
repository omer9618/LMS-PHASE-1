import type { Prisma } from '@prisma/client';

/**
 * The client handed to `prisma.$transaction(async (tx) => ...)`.
 * Every DAO write method accepts one of these as an optional last argument.
 */
export type TransactionClient = Prisma.TransactionClient;
