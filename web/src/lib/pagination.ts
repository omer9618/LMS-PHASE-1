/** One slot in a row of page links: a page number, or a gap standing for skipped pages. */
export type PageSlot = number | 'gap';

/**
 * The page links to show for `current` of `count`: the first and last page, the pages around the
 * current one, and a gap where pages are skipped. Never more than `2 * around + 5` slots, so the
 * row fits a phone: 1 … 19 20 21 … 42.
 */
export function pageWindow(current: number, count: number, around = 1): PageSlot[] {
  const last = Math.max(1, Math.trunc(count));
  const page = Math.min(Math.max(1, Math.trunc(current)), last);
  const wanted = new Set<number>([1, last]);
  for (let n = page - around; n <= page + around; n++) {
    if (n >= 1 && n <= last) wanted.add(n);
  }
  const pages = [...wanted].sort((a, b) => a - b);
  const slots: PageSlot[] = [];
  pages.forEach((n, index) => {
    const before = pages[index - 1];
    if (before !== undefined && n - before === 2) slots.push(before + 1);
    else if (before !== undefined && n - before > 2) slots.push('gap');
    slots.push(n);
  });
  return slots;
}
