/**
 * Learner progress (#90–#97, #77). Pure: no Nest, no Prisma, no clock.
 *
 * - Watch positions (#91) and the skip-resistant maximum position.
 * - Automatic completion at the configured threshold (#92).
 * - Which lessons a student may complete by hand (#93).
 * - Lesson unlock state, derived from completions and passed checkpoints, never stored (#96, #97,
 *   #77).
 */
import { DomainError } from '../../../common/errors/domain.error';

// ── Watch position (#91) ──────────────────────────────────────────────

/**
 * Skip resistance for the maximum position. The player reports its position every few seconds;
 * the furthest point reached (`max`) may advance only by what could plausibly have been watched
 * since the previous report:
 *
 *   allowed advance = elapsed × PLAYBACK_SPEED_ALLOWANCE + min(elapsed, TOLERANCE_SECONDS)
 *
 * where `elapsed` is the wall time since the previous report, capped at MAX_COUNTED_GAP_SECONDS.
 * - ×2 allows double-speed playback.
 * - The tolerance (up to 10 s) absorbs network latency and heartbeat jitter. It grows with elapsed
 *   time, so firing many reports in quick succession earns almost nothing.
 * - The cap means returning after a day away does not license a jump to the end: after any gap,
 *   one report advances `max` by at most 2 × 60 + 10 = 130 s, and later reports are again bound by
 *   wall time.
 * - The very first report of a lesson may set `max` to at most TOLERANCE_SECONDS.
 * - `max` never exceeds the video's duration (when known) and never goes down.
 * The last position (for resume) is stored as reported, clamped to [0, duration].
 */
export const PLAYBACK_SPEED_ALLOWANCE = 2;
export const TOLERANCE_SECONDS = 10;
export const MAX_COUNTED_GAP_SECONDS = 60;

export interface WatchState {
  lastPositionSeconds: number;
  maxPositionSeconds: number;
  updatedAt: Date;
}

export interface WatchUpdate {
  lastPositionSeconds: number;
  maxPositionSeconds: number;
}

export function decideWatchUpdate(
  current: WatchState | null,
  reportedSeconds: number,
  durationSeconds: number | null,
  now: Date,
): WatchUpdate {
  const ceiling = durationSeconds !== null && durationSeconds > 0 ? durationSeconds : Infinity;
  const position = Math.max(0, Math.min(Math.floor(reportedSeconds), ceiling));

  if (!current) {
    return {
      lastPositionSeconds: position,
      maxPositionSeconds: Math.min(position, TOLERANCE_SECONDS),
    };
  }

  const elapsedRaw = (now.getTime() - current.updatedAt.getTime()) / 1000;
  const elapsed = Math.max(0, Math.min(elapsedRaw, MAX_COUNTED_GAP_SECONDS));
  const allowedAdvance = elapsed * PLAYBACK_SPEED_ALLOWANCE + Math.min(elapsed, TOLERANCE_SECONDS);
  const reachable = Math.floor(current.maxPositionSeconds + allowedAdvance);
  const candidate = Math.min(position, reachable, ceiling);
  return {
    lastPositionSeconds: position,
    maxPositionSeconds: Math.max(current.maxPositionSeconds, candidate),
  };
}

// ── Automatic completion (#92) ────────────────────────────────────────

/**
 * True when the furthest position reached covers at least `thresholdPct` of the video. Measured on
 * the maximum position, never the last one, so rewinding does not undo it. Unknown or zero
 * duration never auto-completes (the student can still mark the lesson complete, #93).
 */
export function reachesCompletionThreshold(
  maxPositionSeconds: number,
  durationSeconds: number | null,
  thresholdPct: number,
): boolean {
  if (durationSeconds === null || durationSeconds <= 0) return false;
  return maxPositionSeconds * 100 >= thresholdPct * durationSeconds;
}

// ── Manual completion (#93) ───────────────────────────────────────────

export type LessonTypeValue = 'VIDEO' | 'PDF' | 'TEXT' | 'QUIZ';

export class ProgressRefusedError extends DomainError {
  readonly code = 'PROGRESS_REFUSED';
}

/** Quiz lessons complete only by passing the quiz (source QUIZ); every other type may be marked. */
export function assertManuallyCompletable(type: LessonTypeValue): void {
  if (type === 'QUIZ') {
    throw new ProgressRefusedError('A quiz lesson is completed by passing its quiz', {
      reason: 'QUIZ_LESSON',
    });
  }
}

/** Watch positions are tracked for video lessons only. */
export function assertWatchable(type: LessonTypeValue): void {
  if (type !== 'VIDEO') {
    throw new ProgressRefusedError('Only video lessons have a watch position', {
      reason: 'NOT_A_VIDEO',
    });
  }
}

// ── Unlock state (#96, #97, #77) ─────────────────────────────────────

export type ProgressionModeValue = 'FREE' | 'SEQUENTIAL';

/** One lesson, in course order (section order, then lesson order). */
export interface LessonUnlockFacts {
  id: string;
  title: string;
  /** Free-preview lessons are public (the demo), so they are never locked. */
  isFreePreview: boolean;
  /** A quiz lesson whose quiz has `is_breakpoint = true` (#77). */
  isCheckpoint: boolean;
  completed: boolean;
  /** The student has a passed attempt at this lesson's quiz. */
  quizPassed: boolean;
}

export type LockCause = 'CHECKPOINT_NOT_PASSED' | 'PREVIOUS_LESSON_INCOMPLETE';

export interface LessonLock {
  cause: LockCause;
  blockingLessonId: string;
  blockingLessonTitle: string;
}

export type LessonState =
  | { lessonId: string; state: 'COMPLETED' }
  | { lessonId: string; state: 'AVAILABLE' }
  | { lessonId: string; state: 'LOCKED'; lock: LessonLock };

/**
 * Derives each lesson's state. Nothing here is stored: it is recomputed from completions and quiz
 * results on every read, so reordering lessons or adding a checkpoint takes effect at once.
 *
 * - A completed lesson stays COMPLETED and open, so students can always revisit what they did.
 * - A checkpoint (#77) blocks every later lesson, in FREE and SEQUENTIAL courses alike, until the
 *   student passes it. When several apply, the earliest unpassed checkpoint is reported. It takes
 *   precedence over the sequential cause, since it is the stronger gate.
 * - In a SEQUENTIAL course (#96), a lesson unlocks when every preceding lesson is complete; the
 *   blocking lesson reported is the first incomplete one (the one to do next).
 * - Free-preview lessons are never locked.
 */
export function deriveLessonStates(
  mode: ProgressionModeValue,
  lessons: readonly LessonUnlockFacts[],
): LessonState[] {
  let firstIncomplete: LessonUnlockFacts | null = null;
  let firstUnpassedCheckpoint: LessonUnlockFacts | null = null;
  const states: LessonState[] = [];

  for (const lesson of lessons) {
    if (lesson.completed) {
      states.push({ lessonId: lesson.id, state: 'COMPLETED' });
    } else if (lesson.isFreePreview) {
      states.push({ lessonId: lesson.id, state: 'AVAILABLE' });
    } else if (firstUnpassedCheckpoint) {
      states.push({
        lessonId: lesson.id,
        state: 'LOCKED',
        lock: lockBy('CHECKPOINT_NOT_PASSED', firstUnpassedCheckpoint),
      });
    } else if (mode === 'SEQUENTIAL' && firstIncomplete) {
      states.push({
        lessonId: lesson.id,
        state: 'LOCKED',
        lock: lockBy('PREVIOUS_LESSON_INCOMPLETE', firstIncomplete),
      });
    } else {
      states.push({ lessonId: lesson.id, state: 'AVAILABLE' });
    }

    if (!lesson.completed && !firstIncomplete) firstIncomplete = lesson;
    // A quiz lesson is completed only by passing (source QUIZ), so either fact clears it.
    const cleared = lesson.quizPassed || lesson.completed;
    if (lesson.isCheckpoint && !cleared && !firstUnpassedCheckpoint) {
      firstUnpassedCheckpoint = lesson;
    }
  }
  return states;
}

function lockBy(cause: LockCause, blocking: LessonUnlockFacts): LessonLock {
  return { cause, blockingLessonId: blocking.id, blockingLessonTitle: blocking.title };
}

/** The lesson to continue with: the first one not yet completed that is open. */
export function currentLessonId(states: readonly LessonState[]): string | null {
  return states.find((s) => s.state === 'AVAILABLE')?.lessonId ?? null;
}

/** Student-facing message per lock cause (#97). */
export function lockMessage(lock: LessonLock): string {
  return lock.cause === 'CHECKPOINT_NOT_PASSED'
    ? `Pass the checkpoint quiz "${lock.blockingLessonTitle}" to unlock this lesson`
    : `Complete "${lock.blockingLessonTitle}" to unlock this lesson`;
}
