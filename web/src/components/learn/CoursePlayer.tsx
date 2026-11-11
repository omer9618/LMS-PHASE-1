'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackLink,
  Badge,
  Button,
  ButtonLink,
  Icon,
  LoadError,
  ProgressBar,
  Skeleton,
} from '@/components/ui';
import { QuizPanel } from '@/components/quiz/QuizPanel';
import { RequestError, errorMessage } from '@/lib/api/errors';
import { learn, type LearnApi, type LearnerLesson, type LearnerOutline } from '@/lib/api/learn';
import { curlyQuotes, flattenLessons, pickLesson } from '@/lib/learn/outline';
import { usePageTitle } from '@/lib/use-page-title';
import { LessonBody } from './LessonBody';
import { LessonOutline } from './LessonOutline';
import { VideoLesson } from './VideoLesson';
import styles from './Player.module.css';

export interface CoursePlayerProps {
  courseId: string;
  client?: LearnApi;
}

/**
 * #53: the course player. Outline with lesson states and lock causes on the side (a drawer on
 * small screens), the selected lesson in the main column. The selected lesson is in the URL
 * (`?lesson=`) so it survives reloads and can be shared with a teacher.
 */
export function CoursePlayer({ courseId, client = learn }: CoursePlayerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [outline, setOutline] = useState<LearnerOutline | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [completing, setCompleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // The outline is open beside the lesson on a wide screen. On a phone it starts closed, so the
  // lesson is what you see first instead of two thousand pixels of outline.
  // A timed attempt is a focused mode: no outline, no links to other lessons, until it is over.
  const [attemptActive, setAttemptActive] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(
    () =>
      typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 60rem)').matches,
  );

  const load = useCallback(async () => {
    try {
      setOutline(await client.outline(courseId));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [client, courseId]);

  useEffect(() => {
    let cancelled = false;
    client.outline(courseId).then(
      (o) => !cancelled && setOutline(o),
      (e) => !cancelled && setError(e),
    );
    return () => {
      cancelled = true;
    };
  }, [client, courseId]);

  const lessons = useMemo(() => (outline ? flattenLessons(outline) : []), [outline]);
  const selected = outline ? pickLesson(outline, search.get('lesson')) : null;
  const position = selected ? lessons.findIndex((l) => l.id === selected.id) : -1;
  usePageTitle(outline ? `${selected ? `${selected.title} · ` : ''}${outline.title}` : null);

  // The address always names the lesson on screen, so a reload or a shared link comes back to
  // it. This also covers a link with no lesson, a stale one, and the lesson that "continue here"
  // picked, which would otherwise move on by itself when a lesson is marked complete.
  const requestedLesson = search.get('lesson');
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (selectedId && requestedLesson !== selectedId) {
      router.replace(`${pathname}?lesson=${encodeURIComponent(selectedId)}`, { scroll: false });
    }
  }, [selectedId, requestedLesson, pathname, router]);

  const select = useCallback(
    (lessonId: string) => {
      setActionError(null);
      router.replace(`${pathname}?lesson=${encodeURIComponent(lessonId)}`, { scroll: true });
    },
    [router, pathname],
  );

  async function markComplete(lesson: LearnerLesson) {
    setCompleting(true);
    setActionError(null);
    try {
      await client.complete(courseId, lesson.id);
      await load();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setCompleting(false);
    }
  }

  if (error) {
    return (
      <div className={styles.layout}>
        <PlayerError
          error={error}
          courseId={courseId}
          pathname={pathname}
          onRetry={() => {
            setError(null);
            void load();
          }}
        />
      </div>
    );
  }
  if (!outline) {
    // Inside the player's own frame, so the page does not collapse and jump when the course loads.
    return (
      <div className={styles.layout}>
        <Skeleton label="Loading course…" lines={4} />
      </div>
    );
  }

  const isStudent = outline.viewer === 'STUDENT';
  const previous = position > 0 ? lessons[position - 1] : null;
  const next = position >= 0 && position < lessons.length - 1 ? lessons[position + 1] : null;

  return (
    <div className={styles.layout} data-focus={attemptActive || undefined}>
      <header className={styles.courseHeader}>
        {isStudent && !attemptActive && <BackLink href="/dashboard">My learning</BackLink>}
        <h1>{outline.title}</h1>
        {isStudent ? (
          <div className={styles.progress}>
            <ProgressBar
              className={styles.progressTrack}
              value={outline.completionPercent}
              label="Course progress"
            />
            <span className={styles.muted}>
              {outline.completionPercent}% · {outline.completedLessons} of {outline.totalLessons}{' '}
              lessons
            </span>
          </div>
        ) : (
          <Badge tone="info">Staff preview: nothing is recorded</Badge>
        )}
      </header>

      {!attemptActive && (
        <aside className={styles.sidebar}>
          <details
            className={styles.drawer}
            open={outlineOpen}
            onToggle={(event) => setOutlineOpen(event.currentTarget.open)}
          >
            <summary>
              Course outline
              {isStudent && (
                <span className={styles.muted}>
                  {' '}
                  · {outline.completedLessons} of {outline.totalLessons} done
                </span>
              )}
            </summary>
            <LessonOutline
              outline={outline}
              selectedLessonId={selected?.id ?? null}
              onSelect={select}
            />
          </details>
        </aside>
      )}

      <section className={styles.main} aria-labelledby="lesson-title">
        {!selected ? (
          <Alert tone="info">This course has no lessons yet.</Alert>
        ) : (
          <>
            <div className="cluster">
              <h2 id="lesson-title">{selected.title}</h2>
              {selected.state === 'COMPLETED' && <Badge tone="success">Completed</Badge>}
              {selected.isCheckpoint && <Badge tone="warning">Checkpoint</Badge>}
            </div>

            {selected.state === 'LOCKED' && selected.lock ? (
              <Alert tone="warning" title="This lesson is locked">
                <p>{curlyQuotes(selected.lock.message)}</p>
                <p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => select(selected.lock!.blockingLessonId)}
                  >
                    Go to “{selected.lock.blockingLessonTitle}”
                  </Button>
                </p>
              </Alert>
            ) : (
              <LessonContentFor
                key={selected.id}
                lesson={selected}
                courseId={courseId}
                isStudent={isStudent}
                client={client}
                onProgress={load}
                onAttemptActive={setAttemptActive}
              />
            )}

            {actionError && <Alert tone="danger">{actionError}</Alert>}

            {!attemptActive && (
              <div className={styles.lessonFooter}>
                {previous ? (
                  <Button variant="ghost" onClick={() => select(previous.id)}>
                    <Icon name="arrowLeft" /> {previous.title}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="cluster">
                  {isStudent && selected.type !== 'QUIZ' && selected.state === 'AVAILABLE' && (
                    <Button
                      variant="secondary"
                      onClick={() => markComplete(selected)}
                      loading={completing}
                      loadingText="Saving…"
                    >
                      Mark as complete
                    </Button>
                  )}
                  {next && next.state === 'LOCKED' ? (
                    <span className={styles.muted}>Next: {next.title} unlocks after this one</span>
                  ) : next ? (
                    <Button
                      variant={selected.state === 'COMPLETED' ? 'primary' : 'ghost'}
                      onClick={() => select(next.id)}
                    >
                      {next.title} <Icon name="arrowRight" />
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function LessonContentFor({
  lesson,
  courseId,
  isStudent,
  client,
  onProgress,
  onAttemptActive,
}: {
  lesson: LearnerLesson;
  courseId: string;
  isStudent: boolean;
  client: LearnApi;
  onProgress: () => void;
  onAttemptActive: (active: boolean) => void;
}) {
  switch (lesson.type) {
    case 'VIDEO':
      return (
        <VideoLesson
          courseId={courseId}
          lessonId={lesson.id}
          title={lesson.title}
          resumeAtSeconds={lesson.resumePositionSeconds}
          track={isStudent}
          onCompleted={onProgress}
          client={client}
        />
      );
    case 'QUIZ':
      return (
        <QuizPanel
          courseId={courseId}
          lessonId={lesson.id}
          viewer={isStudent ? 'STUDENT' : 'STAFF'}
          onAttemptClosed={onProgress}
          onAttemptActive={onAttemptActive}
          client={client}
        />
      );
    default:
      return <LessonBody courseId={courseId} lessonId={lesson.id} client={client} />;
  }
}

function PlayerError({
  error,
  courseId,
  pathname,
  onRetry,
}: {
  error: unknown;
  courseId: string;
  pathname: string;
  onRetry: () => void;
}) {
  const name = error instanceof RequestError ? error.name : null;
  if (name === 'UNAUTHENTICATED') {
    return (
      <Alert tone="info" title="Sign in to continue">
        <ButtonLink href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</ButtonLink>
      </Alert>
    );
  }
  if (name === 'ENROLLMENT_REQUIRED' || name === 'ENROLLMENT_EXPIRED') {
    return (
      <Alert tone="warning" title={errorMessage(error)}>
        <Link href={`/courses/${encodeURIComponent(courseId)}`}>See the course details</Link>
      </Alert>
    );
  }
  return (
    <LoadError
      title="The course could not be opened"
      onRetry={onRetry}
      backHref="/dashboard"
      backLabel="My learning"
    >
      {errorMessage(error)}
    </LoadError>
  );
}
