import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { createTestApp } from './utils/test-app';

/** The payout run is ranked, paged and totalled by the database: one request, any number of teachers. */
describe('Payout run (#85-#89)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;
  let adminId: string;
  let teacherAId: string;
  let teacherBId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAs(app, SEEDED.admin);
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.admin.email } })).id;
    teacherAId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherA.email } }))
      .id;
    teacherBId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherB.email } }))
      .id;
    // A known starting point for the two teachers this file reasons about.
    for (const teacherId of [teacherAId, teacherBId]) {
      await prisma.payoutDispute.deleteMany({ where: { teacherId } });
      await prisma.teacherLedger.deleteMany({ where: { teacherId } });
      await prisma.payout.deleteMany({ where: { teacherId } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const run = async (query = 'limit=100') =>
    (await http().get(`/admin/payouts/run?${query}`).set('Cookie', admin).expect(200)).body.data;
  const earn = (
    teacherId: string,
    amountMinor: bigint,
    type: 'EARNING' | 'REFUND' | 'PAYOUT' = 'EARNING',
  ) => prisma.teacherLedger.create({ data: { teacherId, type, amountMinor, currency: 'PKR' } });
  interface Row {
    teacherId: string;
    status: string;
    balances: Array<Record<string, string>>;
    lastPayout: { status: string; transferDate: string } | null;
  }
  /** The whole run, page by page: the test database holds teachers from earlier runs too. */
  const wholeRun = async (): Promise<{
    items: Row[];
    totalsOwed: Array<{ currency: string; minor: string }>;
    total: number;
  }> => {
    const items: Row[] = [];
    let page = await run('limit=100&offset=0');
    items.push(...page.items);
    while (items.length < page.total) {
      page = await run(`limit=100&offset=${items.length}`);
      if (page.items.length === 0) break;
      items.push(...page.items);
    }
    return { items, totalsOwed: page.totalsOwed, total: page.total };
  };
  const rowFor = (data: { items: Row[] }, teacherId: string): Row => {
    const row = data.items.find((item) => item.teacherId === teacherId);
    if (!row) throw new Error(`teacher ${teacherId} is not in the payout run`);
    return row;
  };

  it('is for admins only', async () => {
    await http().get('/admin/payouts/run').expect(401);
    const teacher = await loginAs(app, SEEDED.teacherA);
    await http().get('/admin/payouts/run').set('Cookie', teacher).expect(403);
  });

  it('ranks teachers by what they are owed, with exact balances and the totals owed', async () => {
    await earn(teacherAId, 50_000n);
    await earn(teacherBId, 90_000n);
    await earn(teacherBId, -30_000n, 'REFUND');

    const before = await wholeRun();
    const a = rowFor(before, teacherAId);
    const b = rowFor(before, teacherBId);
    expect(a).toMatchObject({ status: 'DUE', lastPayout: null });
    expect(a.balances).toEqual([
      expect.objectContaining({ currency: 'PKR', balanceMinor: '50000', earningsMinor: '50000' }),
    ]);
    // B: 90,000 earned less a 30,000 refund debit = 60,000, so B is owed more than A's 50,000.
    expect(b.balances[0]).toMatchObject({
      balanceMinor: '60000',
      earningsMinor: '90000',
      refundsMinor: '-30000',
    });
    const ids = before.items.map((row: { teacherId: string }) => row.teacherId);
    expect(ids.indexOf(teacherBId)).toBeLessThan(ids.indexOf(teacherAId));

    // Every positive balance of every active teacher is in the totals, not just this page's.
    const owedTotal = BigInt(before.totalsOwed.find((t) => t.currency === 'PKR')?.minor ?? '0');
    expect(owedTotal).toBeGreaterThanOrEqual(110_000n);
    expect(before.total).toBeGreaterThanOrEqual(2);
  });

  it('pages the run, and a payout in dispute outranks money owed', async () => {
    const first = await run('limit=1&offset=0');
    expect(first.items).toHaveLength(1);
    const second = await run('limit=1&offset=1');
    expect(second.items).toHaveLength(1);
    expect(second.items[0].teacherId).not.toBe(first.items[0].teacherId);
    expect(second.total).toBe(first.total);
    expect((await run('limit=1&offset=100000')).items).toEqual([]);

    const payout = await prisma.payout.create({
      data: {
        teacherId: teacherAId,
        amountMinor: 10_000n,
        status: 'DISPUTED',
        recordedById: adminId,
        transferDate: new Date('2026-11-01T00:00:00.000Z'),
        disputeDeadline: new Date(Date.now() + 7 * 24 * 3_600_000),
      },
    });
    const after = await wholeRun();
    expect(rowFor(after, teacherAId)).toMatchObject({
      status: 'DISPUTED',
      lastPayout: { status: 'DISPUTED' },
    });
    expect(rowFor(after, teacherAId).lastPayout?.transferDate).toContain('2026-11-01');
    expect(rowFor(after, teacherBId).status).toBe('DUE');
    await prisma.payout.delete({ where: { id: payout.id } });
  });

  it('is CLEAR once the balance is paid out, and refuses bad paging', async () => {
    await earn(teacherBId, -60_000n, 'PAYOUT');
    expect(rowFor(await wholeRun(), teacherBId)).toMatchObject({ status: 'CLEAR' });
    await http().get('/admin/payouts/run?limit=0').set('Cookie', admin).expect(400);
    await http().get('/admin/payouts/run?limit=1000').set('Cookie', admin).expect(400);
    await http().get('/admin/payouts/run?bogus=1').set('Cookie', admin).expect(400);
  });
});
