'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, ButtonLink } from '@/components/ui';
import { QuizPanel } from '@/components/quiz/QuizPanel';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { learn, type LearnApi, type LearnerLesson, type LearnerOutline } from '@/lib/api/learn';
import { flattenLessons, pickLesson } from '@/lib/learn-outline';
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

  if (error) return <PlayerError error={error} courseId={courseId} pathname={pathname} />;
  if (!outline) {
    return (
      <p className={styles.muted} role="status">
        Loading course…
      </p>
    );
  }

  const isStudent = outline.viewer === 'STUDENT';
  const previous = position > 0 ? lessons[position - 1] : null;
  const next = position >= 0 && position < lessons.length - 1 ? lessons[position + 1] : null;

  return (
    <div className={styles.layout}>
      <header className={styles.courseHeader}>
        <h1>{outline.title}</h1>
        {isStudent ? (
          <div className={styles.progress}>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="Course progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={outline.completionPercent}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${outline.completionPercent}%` }}
              />
            </div>
            <span className={styles.muted}>
              {outline.completionPercent}% · {outline.completedLessons} of {outline.totalLessons}{' '}
              lessons
            </span>
          </div>
        ) : (
          <Badge tone="info">Staff preview: nothing is recorded</Badge>
        )}
      </header>

      <aside className={styles.sidebar}>
        <details className={styles.drawer} open>
          <summary>Course outline</summary>
          <LessonOutline
            outline={outline}
            selectedLessonId={selected?.id ?? null}
            onSelect={select}
          />
        </details>
      </aside>

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
                <p>{selected.lock.message}</p>
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
              />
            )}

            {actionError && <Alert tone="danger">{actionError}</Alert>}

            <div className={styles.lessonFooter}>
              {previous ? (
                <Button variant="ghost" onClick={() => select(previous.id)}>
                  ← {previous.title}
                </Button>
              ) : (
                <span />
              )}
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
              {next ? (
                <Button
                  variant={selected.state === 'COMPLETED' ? 'primary' : 'ghost'}
                  onClick={() => select(next.id)}
                >
                  {next.title} →
                </Button>
              ) : (
                <span />
              )}
            </div>
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
}: {
  lesson: LearnerLesson;
  courseId: string;
  isStudent: boolean;
  client: LearnApi;
  onProgress: () => void;
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
}: {
  error: unknown;
  courseId: string;
  pathname: string;
}) {
  const name = error instanceof ApiError ? error.name : null;
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
    <Alert tone="danger" title="The course could not be opened">
      {errorMessage(error)}
    </Alert>
  );
}
