'use client';

import { Icon } from '@/components/ui';
import { useEffect, useRef, useState } from 'react';
import { clockOffsetMs, formatCountdown, isRunningLow, remainingMs } from '@/lib/quiz/timer';
import styles from './Quiz.module.css';

export interface QuizTimerProps {
  deadline: string | null;
  serverTime: string;
  timeLimitSeconds: number | null;
  onExpired: () => void;
}

/**
 * Time left, counted from the server's clock (#73). Purely a display: the API refuses late
 * answers whatever this shows. Announces only the one-minute warning and the end, not every tick.
 */
export function QuizTimer({ deadline, serverTime, timeLimitSeconds, onExpired }: QuizTimerProps) {
  const [offset] = useState(() => clockOffsetMs(serverTime, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const expired = useRef(false);
  const onExpiredRef = useRef(onExpired);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadline]);

  const left = remainingMs(deadline, offset, now);

  useEffect(() => {
    if (left === 0 && !expired.current) {
      expired.current = true;
      onExpiredRef.current();
    }
  }, [left]);

  if (left === null) return <span className={styles.timer}>No time limit</span>;
  const low = isRunningLow(left, timeLimitSeconds);
  return (
    <span className={styles.timer} data-low={low || undefined}>
      <span className="visually-hidden">Time left: </span>
      <Icon name="clock" />
      <time>{formatCountdown(left)}</time>
      <span className="visually-hidden" role="status" aria-live="polite">
        {left === 0 ? 'Time is up.' : low ? 'Time is running low.' : ''}
      </span>
    </span>
  );
}
