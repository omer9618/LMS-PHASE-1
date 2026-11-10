import { formatAmount } from './money';

// Emails (formatAmount) and the web app (web/src/lib/money.ts formatMoney) must write the same
// amount the same way, so a student sees one figure in the inbox and on the page.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const web = require('../../web/src/lib/money') as {
  formatMoney(minor: string, currency: string): string;
};

describe('formatAmount matches the web formatMoney', () => {
  const amounts = [0n, 5n, 99n, 150000n, -250n, -150000n, 123456789n, -1n];
  const currencies = ['PKR', 'USD', 'GBP', 'JPY', 'KWD'];

  it.each(currencies)('%s', (currency) => {
    for (const minor of amounts) {
      expect(formatAmount(minor, currency)).toBe(web.formatMoney(minor.toString(), currency));
    }
  });
});
