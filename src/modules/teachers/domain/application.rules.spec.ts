import {
  ApplicationStatusValue,
  decideLink,
  decideReview,
  InvalidApplicationTransitionError,
  purgeDate,
} from './application.rules';

const now = new Date('2026-10-26T15:30:00Z');
const ALL: ApplicationStatusValue[] = ['SUBMITTED', 'UNDER_REVIEW', 'REJECTED', 'HIRED'];
const VALID: Array<[ApplicationStatusValue, ApplicationStatusValue]> = [
  ['SUBMITTED', 'UNDER_REVIEW'],
  ['SUBMITTED', 'REJECTED'],
  ['SUBMITTED', 'HIRED'],
  ['UNDER_REVIEW', 'REJECTED'],
  ['UNDER_REVIEW', 'HIRED'],
];

describe('application review rules', () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it.each(pairs)('%s -> %s', (from, to) => {
    const valid = VALID.some(([f, t]) => f === from && t === to);
    if (valid) {
      expect(decideReview(from, to, now, 180).status).toBe(to);
    } else {
      expect(() => decideReview(from, to, now, 180)).toThrow(InvalidApplicationTransitionError);
    }
  });

  it('sets a purge date only when rejecting, as a UTC calendar date', () => {
    expect(decideReview('SUBMITTED', 'REJECTED', now, 180).purgeAfter).toEqual(
      new Date('2027-04-24T00:00:00Z'),
    );
    expect(decideReview('SUBMITTED', 'HIRED', now, 180).purgeAfter).toBeNull();
    expect(purgeDate(new Date('2026-12-31T23:59:59Z'), 1)).toEqual(
      new Date('2027-01-01T00:00:00Z'),
    );
  });

  it('linking hires, idempotently, but never revives a rejected application', () => {
    expect(decideLink('UNDER_REVIEW', now).status).toBe('HIRED');
    expect(decideLink('HIRED', now).status).toBe('HIRED');
    expect(() => decideLink('REJECTED', now)).toThrow(InvalidApplicationTransitionError);
  });
});
