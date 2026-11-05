import { Role } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { fakeUser } from '../../../../test/utils/fake-user';
import type { TransactionService } from '../../../prisma/transaction.service';
import type { EnrollmentService } from '../../enrollment/services/enrollment.service';
import type { LedgerService } from '../../ledger/services/ledger.service';
import type { OrderService } from '../../orders/services/order.service';
import type { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { VerificationDao } from '../dao/verification.dao';
import { VerificationService } from './verification.service';

describe('VerificationService.confirm (#64, #48, #80)', () => {
  const tx = { tx: true };
  const admin = fakeUser('admin', Role.ADMIN);
  const order = {
    id: 'o1',
    studentId: 's1',
    paymentReference: 'LMS-AAAA-BBBB',
    totalMinor: 1000n,
    currency: 'PKR',
    status: 'PROOF_SUBMITTED',
    proofs: [{ id: 'p1' }],
    items: [
      {
        id: 'i1',
        courseId: 'c1',
        teacherId: 't1',
        netTeacherMinor: 800n,
        course: { title: 'Chem' },
      },
    ],
  };

  function build() {
    const verificationDao = {
      createPaymentVerification: jest.fn().mockResolvedValue({ id: 'v1', outcome: 'CONFIRMED' }),
    };
    const orderService = {
      getOrderInTransaction: jest.fn().mockResolvedValue(order),
      transition: jest.fn().mockResolvedValue({ to: 'VERIFIED' }),
      notifyOrderVerified: jest.fn(),
      notifyOrderRejected: jest.fn(),
      notifyTopUpRequested: jest.fn(),
    };
    const enrollmentService = { grantPurchased: jest.fn().mockResolvedValue(1) };
    const ledgerService = { recordEarnings: jest.fn().mockResolvedValue([{ id: 'l1' }]) };
    const transactions = { run: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const service = new VerificationService(
      verificationDao as unknown as VerificationDao,
      orderService as unknown as OrderService,
      enrollmentService as unknown as EnrollmentService,
      ledgerService as unknown as LedgerService,
      {} as PlatformSettingsService,
      transactions as unknown as TransactionService,
      logger as unknown as PinoLogger,
    );
    return { service, verificationDao, orderService, enrollmentService, ledgerService, logger };
  }

  it('writes everything in one transaction and emails after it', async () => {
    const m = build();
    const result = await m.service.confirm(admin, 'o1', {
      amountReceivedMinor: 1000n,
      valueDate: '2020-01-01',
    });
    expect(result).toMatchObject({
      status: 'VERIFIED',
      enrollmentsGranted: 1,
      ledgerEntriesWritten: 1,
    });
    expect(m.verificationDao.createPaymentVerification).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'CONFIRMED', amountReceivedMinor: 1000n, proofId: 'p1' }),
      tx,
    );
    expect(m.enrollmentService.grantPurchased).toHaveBeenCalledWith(
      's1',
      [{ courseId: 'c1', orderItemId: 'i1' }],
      tx,
    );
    expect(m.ledgerService.recordEarnings).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'PKR',
        lines: [{ orderItemId: 'i1', teacherId: 't1', courseTitle: 'Chem', netTeacherMinor: 800n }],
      }),
      tx,
    );
    expect(m.orderService.transition).toHaveBeenCalledWith(
      order,
      'CONFIRM',
      'admin',
      expect.any(Object),
      expect.any(Date),
      tx,
    );
    expect(m.orderService.notifyOrderVerified).toHaveBeenCalledWith('o1');
  });

  it('logs a failed confirmation with the order and sends nothing (#9)', async () => {
    const m = build();
    m.ledgerService.recordEarnings.mockRejectedValue(new Error('db down'));
    await expect(
      m.service.confirm(admin, 'o1', { amountReceivedMinor: 1000n, valueDate: '2020-01-01' }),
    ).rejects.toThrow('db down');
    expect(m.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o1', adminId: 'admin', action: 'confirm' }),
      expect.any(String),
    );
    expect(m.orderService.notifyOrderVerified).not.toHaveBeenCalled();
  });

  it('refuses an order that is not awaiting verification before writing anything', async () => {
    const m = build();
    m.orderService.getOrderInTransaction.mockResolvedValue({ ...order, status: 'VERIFIED' });
    await expect(
      m.service.confirm(admin, 'o1', { amountReceivedMinor: 1000n, valueDate: '2020-01-01' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(m.verificationDao.createPaymentVerification).not.toHaveBeenCalled();
    expect(m.logger.warn).toHaveBeenCalled();
  });
});
