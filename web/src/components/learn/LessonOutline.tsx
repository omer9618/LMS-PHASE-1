'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Icon } from '@/components/ui';
import type { LearnerOutline } from '@/lib/api/learn';
import { formatDuration } from '@/lib/format';
import {
  curlyQuotes,
  lessonsExplainingLock,
  lessonStatusLabel,
  lessonTypeLabel,
} from '@/lib/learn/outline';
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

/** The nearest ancestor that scrolls vertically and has something to scroll. */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
  }
  return null;
}

/**
 * Brings `element` into view inside its own scrolling container (the sticky sidebar) and nowhere
 * else, so opening a lesson never moves the page itself.
 */
function revealWithinParent(element: HTMLElement) {
  const parent = scrollParentOf(element);
  if (!parent) return;
  const room = 8;
  const box = parent.getBoundingClientRect();
  const item = element.getBoundingClientRect();
  if (item.top < box.top) parent.scrollTop -= box.top - item.top + room;
  else if (item.bottom > box.bottom) parent.scrollTop += item.bottom - box.bottom + room;
}

/**
 * #53, #94, #97: sections and lessons with their state. Locked lessons stay selectable so the
 * student can read why (the lock cause), but are marked and explained.
 */
export function LessonOutline({ outline, selectedLessonId, onSelect }: LessonOutlineProps) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const explaining = useMemo(() => lessonsExplainingLock(outline), [outline]);

  // A long outline opens with the current lesson in view, and follows it as lessons change.
  useEffect(() => {
    if (currentRef.current) revealWithinParent(currentRef.current);
  }, [selectedLessonId]);

  return (
    <nav aria-label="Lessons" className={styles.outline}>
      {outline.sections.map((section) => (
        <div key={section.id} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
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
                    ref={current ? currentRef : undefined}
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
                      {explaining.has(lesson.id) && lesson.lock && (
                        <span className={styles.lockReason}>
                          {curlyQuotes(lesson.lock.message)}
                        </span>
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
