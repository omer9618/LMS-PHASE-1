import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import type { TransactionClient } from './prisma.types';

/**
 * The only way services start a transaction. Services never inject PrismaService directly:
 * they call `run`, and pass the `tx` they receive to every DAO call inside it.
 *
 *   await this.transactions.run(async (tx) => {
 *     await this.orderDao.updateOrder(id, data, tx);
 *     await this.ledgerDao.createEntries(entries, tx);
 *   });
 */
@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
