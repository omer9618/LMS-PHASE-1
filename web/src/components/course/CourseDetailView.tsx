'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Icon } from '@/components/ui';
import type { CourseDetail, OutlineLesson } from '@/lib/api/schemas/catalogue';
import { formatDuration, PACING_HINTS, PACING_LABELS } from '@/lib/format';
import { DemoPlayer } from './DemoPlayer';
import { EnrollPanel, useAlreadyEnrolled } from './EnrollPanel';
import styles from './Course.module.css';

const LESSON_TYPE_LABELS: Record<string, string> = {
  VIDEO: 'Video',
  PDF: 'Reading (PDF)',
  TEXT: 'Reading',
  QUIZ: 'Quiz',
};

/** Course detail (#43): syllabus coverage, pricing, teacher, the demo (#34) and enrollment. */
export function CourseDetailContent({ course }: { course: CourseDetail }) {
  const demoIds = new Set(course.demoLessonIds);
  const lessons = course.outline.flatMap((s) => s.lessons);
  const demoLessons = lessons.filter((l) => demoIds.has(l.id));
  const [playing, setPlaying] = useState<OutlineLesson | null>(null);
  const totalVideo = formatDuration(course.totalVideoSeconds);
  const enrolled = useAlreadyEnrolled(course.id);

  function watch(lesson: OutlineLesson) {
    setPlaying(lesson);
    document.getElementById('demo')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={styles.layout}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/courses">Courses</Link> <span aria-hidden="true">/</span>{' '}
        <span aria-current="page">{course.title}</span>
      </nav>

      <header className={styles.header}>
        <div className={styles.badges}>
          <Badge tone="primary">{course.subject.name}</Badge>
          <Badge>{course.board.name}</Badge>
          <Badge>{course.level.name}</Badge>
        </div>
        <h1>{course.title}</h1>
        <p className={styles.teacherLine}>
          Taught by{' '}
          {course.teacher.profile ? (
            // Only published profiles are sent, so the link never leads to a 404.
            <Link href={`/teachers/${course.teacher.id}`}>
              <strong>{course.teacher.fullName ?? 'a verified teacher'}</strong>
            </Link>
          ) : (
            <strong>{course.teacher.fullName ?? 'a verified teacher'}</strong>
          )}
        </p>
        <dl className={`${styles.facts} eyebrow-terms`}>
          <div>
            <dt>Pacing</dt>
            <dd>
              {PACING_LABELS[course.progressionMode]}{' '}
              <span className="muted">({PACING_HINTS[course.progressionMode]})</span>
            </dd>
          </div>
          <div>
            <dt>Lessons</dt>
            <dd>{course.lessonCount}</dd>
          </div>
          {totalVideo && (
            <div>
              <dt>Video</dt>
              <dd>{totalVideo}</dd>
            </div>
          )}
        </dl>
      </header>

      <EnrollPanel course={course} />

      <div className={styles.main}>
        {course.description && (
          <section aria-labelledby="about-heading" className={styles.section}>
            <h2 id="about-heading">About this course</h2>
            <p className={styles.prose}>{course.description}</p>
          </section>
        )}

        {demoLessons.length > 0 && (
          <section id="demo" aria-labelledby="demo-heading" className={styles.section}>
            <h2 id="demo-heading">Watch a demo</h2>
            <p className="muted">Free preview lessons, no sign-in needed.</p>
            <div className={styles.demoButtons}>
              {demoLessons.map((lesson) => (
                <Button
                  key={lesson.id}
                  variant={playing?.id === lesson.id ? 'primary' : 'secondary'}
                  aria-pressed={playing?.id === lesson.id}
                  onClick={() => setPlaying(lesson)}
                >
                  <Icon name="play" /> {lesson.title}
                </Button>
              ))}
            </div>
            {playing && <DemoPlayer courseId={course.id} lesson={playing} />}
          </section>
        )}

        <section aria-labelledby="syllabus-heading" className={styles.section}>
          <h2 id="syllabus-heading">Syllabus coverage</h2>
          {course.syllabusArea && <p className={styles.prose}>{course.syllabusArea}</p>}
          {course.outline.length === 0 ? (
            <p className="muted">The outline has not been published yet.</p>
          ) : (
            <ol className={styles.outline}>
              {course.outline.map((section, index) => (
                <li key={section.id} className={styles.outlineSection}>
                  <h3>
                    <span className="muted">Section {index + 1}: </span>
                    {section.title}
                  </h3>
                  <ul className={styles.lessons}>
                    {section.lessons.map((lesson) => (
                      <li key={lesson.id} className={styles.lesson}>
                        <span className={styles.lessonTitle}>
                          {enrolled ? (
                            <Link
                              href={`/learn/${encodeURIComponent(course.id)}?lesson=${encodeURIComponent(lesson.id)}`}
                            >
                              {lesson.title}
                            </Link>
                          ) : (
                            lesson.title
                          )}
                        </span>
                        <span className={styles.lessonMeta}>
                          {LESSON_TYPE_LABELS[lesson.type] ?? lesson.type}
                          {formatDuration(lesson.durationSeconds) &&
                            ` · ${formatDuration(lesson.durationSeconds)}`}
                        </span>
                        {!enrolled && demoIds.has(lesson.id) && (
                          <Button size="sm" variant="ghost" onClick={() => watch(lesson)}>
                            Watch preview
                            <span className="visually-hidden">: {lesson.title}</span>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="teacher-heading" className={styles.section}>
          <h2 id="teacher-heading">Your teacher</h2>
          <div className={styles.teacher}>
            {course.teacher.profile?.photoUrl && (
              // The photo URL comes from storage at runtime, so next/image's static host list
              // cannot cover it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.teacher.profile.photoUrl}
                alt=""
                className={styles.teacherPhoto}
                width={96}
                height={96}
              />
            )}
            <div className={styles.stack}>
              <p className={styles.teacherName}>
                {course.teacher.profile ? (
                  <Link href={`/teachers/${course.teacher.id}`}>
                    {course.teacher.fullName ?? 'Teacher'}
                  </Link>
                ) : (
                  (course.teacher.fullName ?? 'Teacher')
                )}
              </p>
              {course.teacher.profile?.qualifications && (
                <p className="muted">{course.teacher.profile.qualifications}</p>
              )}
              {course.teacher.profile?.bio ? (
                <p className={styles.prose}>{course.teacher.profile.bio}</p>
              ) : (
                <p className="muted">This teacher has not published a profile yet.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
