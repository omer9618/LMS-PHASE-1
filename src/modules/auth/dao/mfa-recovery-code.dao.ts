import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

@Injectable()
export class MfaRecoveryCodeDao {
  constructor(private readonly prisma: PrismaService) {}

  /** Replaces a user's whole set of codes (enable, regenerate). */
  async replaceRecoveryCodes(
    userId: string,
    codeHashes: string[],
    tx: TransactionClient,
  ): Promise<void> {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({
      data: codeHashes.map((codeHash) => ({ userId, codeHash })),
    });
  }

  async deleteRecoveryCodes(userId: string, tx?: TransactionClient): Promise<void> {
    await (tx ?? this.prisma).mfaRecoveryCode.deleteMany({ where: { userId } });
  }

  /** Marks one unused code as used. False if no unused code matches (wrong or already used). */
  async consumeRecoveryCode(
    userId: string,
    codeHash: string,
    usedAt: Date,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const { count } = await (tx ?? this.prisma).mfaRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt },
    });
    return count === 1;
  }

  countUnusedRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  }
}
