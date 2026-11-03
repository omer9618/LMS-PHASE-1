import { buildEarningEntries, LedgerRefusedError } from './ledger.rules';

describe('ledger rules (#80)', () => {
  const lines = [
    { orderItemId: 'i1', teacherId: 't1', courseTitle: 'Chem', netTeacherMinor: 120000n },
    { orderItemId: 'i2', teacherId: 't2', courseTitle: 'Maths', netTeacherMinor: 0n },
  ];

  it('writes one EARNING per line for the net amount in the order currency', () => {
    expect(buildEarningEntries(lines, 'PKR', 'LMS-AAAA-BBBB', new Set())).toEqual([
      {
        teacherId: 't1',
        type: 'EARNING',
        amountMinor: 120000n,
        currency: 'PKR',
        orderItemId: 'i1',
        description: 'Sale of "Chem" (order LMS-AAAA-BBBB)',
      },
      {
        teacherId: 't2',
        type: 'EARNING',
        amountMinor: 0n,
        currency: 'PKR',
        orderItemId: 'i2',
        description: 'Sale of "Maths" (order LMS-AAAA-BBBB)',
      },
    ]);
  });

  it('refuses a line that already has an earning, or appears twice', () => {
    expect(() => buildEarningEntries(lines, 'PKR', 'R', new Set(['i2']))).toThrow(
      LedgerRefusedError,
    );
    expect(() => buildEarningEntries([lines[0]!, lines[0]!], 'PKR', 'R', new Set())).toThrow(
      LedgerRefusedError,
    );
  });

  it('refuses negative amounts and bad currencies', () => {
    expect(() =>
      buildEarningEntries([{ ...lines[0]!, netTeacherMinor: -1n }], 'PKR', 'R', new Set()),
    ).toThrow(LedgerRefusedError);
    expect(() => buildEarningEntries(lines, 'pkr', 'R', new Set())).toThrow(LedgerRefusedError);
  });
});
