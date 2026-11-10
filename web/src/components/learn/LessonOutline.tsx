'use client';

import { Icon } from '@/components/ui';
import type { LearnerOutline } from '@/lib/api/learn';
import { formatDuration } from '@/lib/format';
import { lessonStatusLabel, lessonTypeLabel } from '@/lib/learn-outline';
import styles from './Player.module.css';

export interface LessonOutlineProps {
  outline: LearnerOutline;
  selectedLessonId: string | null;
  onSelect: (lessonId: string) => void;
}

const STATE_ICONS = {
  COMPLETED: <Icon name="check" />,
  AVAILABLE: <Icon name="circle" />,
  LOCKED: <Icon name="lock" />,
} as const;

/**
 * #53, #94, #97: sections and lessons with their state. Locked lessons stay selectable so the
 * student can read why (the lock cause), but are marked and explained.
 */
export function LessonOutline({ outline, selectedLessonId, onSelect }: LessonOutlineProps) {
  return (
    <nav aria-label="Lessons" className={styles.outline}>
      {outline.sections.map((section) => (
        <div key={section.id} className={styles.section}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          <ol>
            {section.lessons.map((lesson) => {
              const current = lesson.id === selectedLessonId;
              const duration = formatDuration(lesson.durationSeconds);
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    className={styles.lessonButton}
                    data-state={lesson.state}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => onSelect(lesson.id)}
                  >
                    <span className={styles.stateIcon} aria-hidden="true">
                      {STATE_ICONS[lesson.state]}
                    </span>
                    <span className={styles.lessonText}>
                      <span className={styles.lessonTitle}>{lesson.title}</span>
                      <span className={styles.lessonMeta}>
                        {lessonTypeLabel(lesson.type)}
                        {duration && ` · ${duration}`}
                        {lesson.isCheckpoint && ' · Checkpoint'}
                      </span>
                      {lesson.state === 'LOCKED' && lesson.lock && (
                        <span className={styles.lockReason}>{lesson.lock.message}</span>
                      )}
                    </span>
                    <span className="visually-hidden">, {lessonStatusLabel(lesson)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}
