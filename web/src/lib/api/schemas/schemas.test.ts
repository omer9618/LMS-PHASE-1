import { describe, expect, it } from 'vitest';
import { courseCard, courseDetail, listing } from '@/test/fixtures';
import * as auth from './auth';
import * as catalogue from './catalogue';
import { minorUnits, paged, isoDateTime } from './common';
import * as enrollment from './enrollment';
import * as learn from './learn';
import * as orders from './orders';

const NOW = '2026-11-09T09:00:00.000Z';

describe('common building blocks', () => {
  it('money is a whole number of minor units in a string, never a float', () => {
    expect(minorUnits.safeParse('150000').success).toBe(true);
    expect(minorUnits.safeParse('-1200').success).toBe(true);
    expect(minorUnits.safeParse('1500.00').success).toBe(false);
    expect(minorUnits.safeParse(150000).success).toBe(false);
  });

  it('timestamps are ISO-8601', () => {
    expect(isoDateTime.safeParse(NOW).success).toBe(true);
    expect(isoDateTime.safeParse('2026-11-09T14:05:00+05:00').success).toBe(true);
    expect(isoDateTime.safeParse('9 Nov 2026').success).toBe(false);
  });

  it('pages carry items and their position', () => {
    const page = paged(catalogue.board);
    expect(page.parse({ items: [], total: 0, limit: 20, offset: 0 }).items).toEqual([]);
    expect(page.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('the shared test fixtures match the API contract', () => {
  it('catalogue', () => {
    expect(catalogue.courseCard.safeParse(courseCard()).success).toBe(true);
    expect(catalogue.catalogueListing.safeParse(listing([courseCard()])).success).toBe(true);
    expect(catalogue.courseDetail.safeParse(courseDetail()).success).toBe(true);
  });
});

describe('auth', () => {
  const user = {
    id: 'u-1',
    email: 'ayesha@example.com',
    fullName: 'Ayesha Khan',
    isEmailVerified: true,
    roles: ['STUDENT'],
  };

  it('reads both login outcomes', () => {
    const signedIn = auth.loginResult.parse({ user });
    expect('user' in signedIn && signedIn.user.email).toBe('ayesha@example.com');
    const challenge = auth.loginResult.parse({
      mfaRequired: true,
      challengeToken: 'tok',
      expiresAt: NOW,
    });
    expect(challenge.mfaRequired).toBe(true);
  });

  it('rejects a role the app does not know, and strips fields it does not use', () => {
    expect(auth.user.safeParse({ ...user, roles: ['OWNER'] }).success).toBe(false);
    const parsed = auth.me.parse({ ...user, mfaEnabled: false, mfaVerified: false, extra: 1 });
    expect(parsed).not.toHaveProperty('extra');
  });
});

describe('orders', () => {
  const order = {
    id: 'o-1',
    paymentReference: 'LMS-Q4HN-2BZE',
    status: 'PENDING',
    totalMinor: '320000',
    currency: 'PKR',
    createdAt: NOW,
    expiresAt: null,
    verifiedAt: null,
    items: [{ courseId: 'c-1', courseTitle: 'Waves', teacherName: null, priceMinor: '320000' }],
    proofs: [],
    paymentInstructions: {
      bankTransferInstructions: 'Pay to …',
      paymentReference: 'LMS-Q4HN-2BZE',
      amountMinor: '320000',
      currency: 'PKR',
      expiresAt: null,
      verificationTurnaroundHours: 48,
    },
    lastDecision: { kind: 'TOP_UP_REQUESTED', shortfallMinor: '20000' },
    guidance: {
      statusLabel: 'Awaiting payment',
      nextAction: 'SUBMIT_PROOF',
      canSubmitProof: true,
      whatHappensNext: 'Transfer the amount, then send the details.',
    },
  };

  it('reads an order with a top-up decision', () => {
    const parsed = orders.studentOrder.parse(order);
    expect(parsed.lastDecision).toEqual({ kind: 'TOP_UP_REQUESTED', shortfallMinor: '20000' });
  });

  it('refuses an amount sent as a number', () => {
    expect(orders.studentOrder.safeParse({ ...order, totalMinor: 3200 }).success).toBe(false);
  });
});

describe('learning', () => {
  it('keeps lesson types and lock causes the API may add later', () => {
    const lesson = learn.learnerLesson.parse({
      id: 'l-1',
      title: 'Measuring g',
      type: 'SIMULATION',
      isFreePreview: false,
      durationSeconds: null,
      isCheckpoint: false,
      passingScorePct: null,
      state: 'LOCKED',
      lock: {
        cause: 'NEW_RULE',
        blockingLessonId: 'l-0',
        blockingLessonTitle: 'Intro',
        message: 'Finish Intro first',
      },
      completion: null,
      resumePositionSeconds: null,
    });
    expect(lesson.type).toBe('SIMULATION');
    expect(lesson.lock?.cause).toBe('NEW_RULE');
  });

  it('reads revealed answers only when present', () => {
    const attempt = learn.attemptView.parse({
      id: 'a-1',
      attemptNumber: 1,
      status: 'SUBMITTED',
      startedAt: NOW,
      submittedAt: NOW,
      scorePct: 100,
      isPassed: true,
      serverTime: NOW,
      deadline: null,
      timedOut: false,
      answersRevealed: true,
      questions: [
        {
          id: 'q-1',
          type: 'NUMERIC',
          contentText: 'g = ?',
          imageUrl: null,
          options: null,
          numericUnit: 'm/s²',
          marks: 3,
          yourAnswer: '9.86',
          isCorrect: true,
          marksAwarded: 3,
          correctAnswer: '9.86',
          numericTolerance: '0.05',
        },
      ],
    });
    expect(attempt.questions[0]?.isCorrect).toBe(true);
  });
});

describe('enrollment', () => {
  it('reads a dashboard row with only the required fields', () => {
    const rows = enrollment.dashboard.parse([
      { id: 'e-1', access: 'ACTIVE', course: { id: 'c-1', title: 'Waves' } },
    ]);
    expect(rows[0]?.access).toBe('ACTIVE');
  });
});

describe('session', () => {
  it('keeps the role context of a dual-role account (#109)', () => {
    const parsed = auth.me.parse({
      id: 'u-9',
      email: 'dual@example.com',
      fullName: null,
      isEmailVerified: true,
      roles: ['ADMIN', 'TEACHER'],
      mfaEnabled: true,
      mfaVerified: true,
      activeContext: 'TEACHER',
      availableContexts: ['ADMIN', 'TEACHER'],
    });
    expect(parsed.activeContext).toBe('TEACHER');
    expect(parsed.availableContexts).toEqual(['ADMIN', 'TEACHER']);
  });
});
