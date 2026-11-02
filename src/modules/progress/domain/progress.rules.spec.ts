import {
  assertManuallyCompletable,
  assertWatchable,
  currentLessonId,
  decideWatchUpdate,
  deriveLessonStates,
  LessonUnlockFacts,
  lockMessage,
  ProgressRefusedError,
  reachesCompletionThreshold,
} from './progress.rules';

const T0 = new Date('2026-11-01T10:00:00Z');
const after = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('decideWatchUpdate (#91)', () => {
  it('first report: stores the position, and max only up to the tolerance', () => {
    expect(decideWatchUpdate(null, 5, 600, T0)).toEqual({
      lastPositionSeconds: 5,
      maxPositionSeconds: 5,
    });
    expect(decideWatchUpdate(null, 500, 600, T0)).toEqual({
      lastPositionSeconds: 500,
      maxPositionSeconds: 10,
    });
  });

  it('advances max with normal playback', () => {
    const current = { lastPositionSeconds: 100, maxPositionSeconds: 100, updatedAt: T0 };
    expect(decideWatchUpdate(current, 115, 600, after(15))).toEqual({
      lastPositionSeconds: 115,
      maxPositionSeconds: 115,
    });
  });

  it('allows double speed plus tolerance, but not a skip', () => {
    const current = { lastPositionSeconds: 100, maxPositionSeconds: 100, updatedAt: T0 };
    // 15 s elapsed: 100 + 15×2 + 10 = 140.
    expect(decideWatchUpdate(current, 140, 600, after(15)).maxPositionSeconds).toBe(140);
    expect(decideWatchUpdate(current, 590, 600, after(15))).toEqual({
      lastPositionSeconds: 590,
      maxPositionSeconds: 140,
    });
  });

  it('rapid-fire reports earn almost nothing', () => {
    let state = { lastPositionSeconds: 0, maxPositionSeconds: 0, updatedAt: T0 };
    for (let i = 1; i <= 50; i += 1) {
      const now = new Date(T0.getTime() + i * 10); // 10 ms apart
      const next = decideWatchUpdate(state, 600, 600, now);
      state = { ...next, updatedAt: now };
    }
    expect(state.maxPositionSeconds).toBeLessThanOrEqual(2);
  });

  it('caps the counted gap, so a long absence does not license a jump to the end', () => {
    const current = { lastPositionSeconds: 100, maxPositionSeconds: 100, updatedAt: T0 };
    // A day later: at most 60×2 + 10 = 130 s further.
    expect(decideWatchUpdate(current, 3000, 3600, after(86_400)).maxPositionSeconds).toBe(230);
  });

  it('never lowers max when rewinding, and stores the last position for resume', () => {
    const current = { lastPositionSeconds: 300, maxPositionSeconds: 300, updatedAt: T0 };
    expect(decideWatchUpdate(current, 20, 600, after(10))).toEqual({
      lastPositionSeconds: 20,
      maxPositionSeconds: 300,
    });
  });

  it('clamps to [0, duration] and ignores clock skew', () => {
    const current = { lastPositionSeconds: 590, maxPositionSeconds: 590, updatedAt: T0 };
    expect(decideWatchUpdate(current, 9999, 600, after(30))).toEqual({
      lastPositionSeconds: 600,
      maxPositionSeconds: 600,
    });
    expect(decideWatchUpdate(current, -5, 600, after(-30))).toEqual({
      lastPositionSeconds: 0,
      maxPositionSeconds: 590,
    });
  });

  it('works without a known duration', () => {
    const current = { lastPositionSeconds: 10, maxPositionSeconds: 10, updatedAt: T0 };
    expect(decideWatchUpdate(current, 25, null, after(10))).toEqual({
      lastPositionSeconds: 25,
      maxPositionSeconds: 25,
    });
  });
});

describe('reachesCompletionThreshold (#92)', () => {
  it('compares max position with the threshold of the duration', () => {
    expect(reachesCompletionThreshold(89, 100, 90)).toBe(false);
    expect(reachesCompletionThreshold(90, 100, 90)).toBe(true);
    expect(reachesCompletionThreshold(100, 100, 100)).toBe(true);
    expect(reachesCompletionThreshold(539, 600, 90)).toBe(false);
    expect(reachesCompletionThreshold(540, 600, 90)).toBe(true);
  });

  it('never completes without a duration', () => {
    expect(reachesCompletionThreshold(100, null, 90)).toBe(false);
    expect(reachesCompletionThreshold(100, 0, 90)).toBe(false);
  });
});

describe('manual completion and watch eligibility (#93, #91)', () => {
  it('refuses manual completion of quiz lessons only', () => {
    expect(() => assertManuallyCompletable('QUIZ')).toThrow(ProgressRefusedError);
    for (const type of ['VIDEO', 'PDF', 'TEXT'] as const) {
      expect(() => assertManuallyCompletable(type)).not.toThrow();
    }
  });

  it('tracks watch position for video lessons only', () => {
    expect(() => assertWatchable('VIDEO')).not.toThrow();
    expect(() => assertWatchable('TEXT')).toThrow(ProgressRefusedError);
  });
});

describe('deriveLessonStates (#96, #97, #77)', () => {
  const lesson = (id: string, facts: Partial<LessonUnlockFacts> = {}): LessonUnlockFacts => ({
    id,
    title: `Lesson ${id}`,
    isFreePreview: false,
    isCheckpoint: false,
    completed: false,
    quizPassed: false,
    ...facts,
  });
  const summary = (states: ReturnType<typeof deriveLessonStates>) =>
    states.map((s) =>
      s.state === 'LOCKED' ? `${s.lessonId}:${s.lock.cause}:${s.lock.blockingLessonId}` : s.state,
    );

  it('FREE: everything is open without checkpoints', () => {
    const states = deriveLessonStates('FREE', [lesson('a'), lesson('b'), lesson('c')]);
    expect(summary(states)).toEqual(['AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
    expect(currentLessonId(states)).toBe('a');
  });

  it('SEQUENTIAL: only the first incomplete lesson is open', () => {
    const states = deriveLessonStates('SEQUENTIAL', [
      lesson('a', { completed: true }),
      lesson('b'),
      lesson('c'),
    ]);
    expect(summary(states)).toEqual(['COMPLETED', 'AVAILABLE', 'c:PREVIOUS_LESSON_INCOMPLETE:b']);
    expect(currentLessonId(states)).toBe('b');
  });

  it('SEQUENTIAL: reports the first incomplete lesson, and keeps completed lessons open', () => {
    // b was completed before a lesson was inserted before it.
    const states = deriveLessonStates('SEQUENTIAL', [
      lesson('a'),
      lesson('b', { completed: true }),
      lesson('c'),
    ]);
    expect(summary(states)).toEqual(['AVAILABLE', 'COMPLETED', 'c:PREVIOUS_LESSON_INCOMPLETE:a']);
  });

  it('SEQUENTIAL: all complete means no current lesson', () => {
    const states = deriveLessonStates('SEQUENTIAL', [lesson('a', { completed: true })]);
    expect(currentLessonId(states)).toBeNull();
  });

  it('FREE: an unpassed checkpoint blocks every later lesson (#77)', () => {
    const states = deriveLessonStates('FREE', [
      lesson('a'),
      lesson('q', { isCheckpoint: true }),
      lesson('b'),
      lesson('c'),
    ]);
    expect(summary(states)).toEqual([
      'AVAILABLE',
      'AVAILABLE',
      'b:CHECKPOINT_NOT_PASSED:q',
      'c:CHECKPOINT_NOT_PASSED:q',
    ]);
  });

  it('a passed checkpoint unlocks what follows', () => {
    const states = deriveLessonStates('FREE', [
      lesson('q', { isCheckpoint: true, quizPassed: true }),
      lesson('b'),
    ]);
    expect(summary(states)).toEqual(['AVAILABLE', 'AVAILABLE']);
  });

  it('a non-checkpoint quiz does not gate', () => {
    const states = deriveLessonStates('FREE', [lesson('q'), lesson('b')]);
    expect(summary(states)).toEqual(['AVAILABLE', 'AVAILABLE']);
  });

  it('SEQUENTIAL: the checkpoint cause takes precedence over the sequential one', () => {
    const states = deriveLessonStates('SEQUENTIAL', [
      lesson('a'),
      lesson('q', { isCheckpoint: true }),
      lesson('b'),
    ]);
    expect(summary(states)).toEqual([
      'AVAILABLE',
      'q:PREVIOUS_LESSON_INCOMPLETE:a',
      'b:CHECKPOINT_NOT_PASSED:q',
    ]);
  });

  it('SEQUENTIAL: a passed checkpoint then gates by completion only', () => {
    const states = deriveLessonStates('SEQUENTIAL', [
      lesson('a', { completed: true }),
      lesson('q', { isCheckpoint: true, quizPassed: true, completed: true }),
      lesson('b'),
      lesson('c'),
    ]);
    expect(summary(states)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'AVAILABLE',
      'c:PREVIOUS_LESSON_INCOMPLETE:b',
    ]);
  });

  it('reports the earliest of several unpassed checkpoints', () => {
    const states = deriveLessonStates('FREE', [
      lesson('q1', { isCheckpoint: true }),
      lesson('q2', { isCheckpoint: true }),
      lesson('b'),
    ]);
    expect(summary(states)).toEqual([
      'AVAILABLE',
      'q2:CHECKPOINT_NOT_PASSED:q1',
      'b:CHECKPOINT_NOT_PASSED:q1',
    ]);
  });

  it('never locks free-preview lessons', () => {
    const states = deriveLessonStates('SEQUENTIAL', [
      lesson('q', { isCheckpoint: true }),
      lesson('demo', { isFreePreview: true }),
      lesson('b'),
    ]);
    expect(summary(states)).toEqual(['AVAILABLE', 'AVAILABLE', 'b:CHECKPOINT_NOT_PASSED:q']);
  });

  it('gives distinct messages per cause (#97)', () => {
    const base = { blockingLessonId: 'x', blockingLessonTitle: 'Forces quiz' };
    expect(lockMessage({ cause: 'CHECKPOINT_NOT_PASSED', ...base })).toMatch(/Pass the checkpoint/);
    expect(lockMessage({ cause: 'PREVIOUS_LESSON_INCOMPLETE', ...base })).toMatch(/^Complete/);
  });
});
