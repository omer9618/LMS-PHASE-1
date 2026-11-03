'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui';
import { errorMessage, isApiError } from '@/lib/api/errors';
import type { LearnApi } from '@/lib/api/learn';
import type { Playback } from '@/lib/api/types';
import { parsePlayerMessage, playerCommands, shouldReport } from '@/lib/player-events';
import styles from './Player.module.css';

export interface VideoLessonProps {
  courseId: string;
  lessonId: string;
  title: string;
  /** Where the student left off (#91); ignored for staff. */
  resumeAtSeconds: number | null;
  /** Report watch positions (students only; staff previews record nothing). */
  track: boolean;
  /** Called when a report comes back with a new completion. */
  onCompleted: () => void;
  client: LearnApi;
}

/**
 * #53: the signed Bunny Stream embed (#37) and watch reporting (#91, #92). The API decides
 * completion from the furthest position reached; we report the position every 15 s while
 * playing, and on pause and end.
 */
export function VideoLesson({
  courseId,
  lessonId,
  title,
  resumeAtSeconds,
  track,
  onCompleted,
  client,
}: VideoLessonProps) {
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState<{ processing: boolean; message: string } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const lastReport = useRef<number | null>(null);
  const position = useRef(0);
  const completed = useRef(false);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    // Mounted once per lesson (keyed by lesson id), so there is no previous video to clear.
    let cancelled = false;
    client.playback(courseId, lessonId).then(
      (p) => !cancelled && setPlayback(p),
      (e) =>
        !cancelled &&
        setError({ processing: isApiError(e, 'VIDEO_NOT_READY'), message: errorMessage(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [client, courseId, lessonId]);

  useEffect(() => {
    if (!playback) return;
    const origin = new URL(playback.embedUrl).origin;
    lastReport.current = null;
    completed.current = false;

    const report = (seconds: number) => {
      if (!track) return;
      lastReport.current = Date.now();
      client.reportWatch(courseId, lessonId, Math.floor(seconds)).then(
        (progress) => {
          if (progress.completion && !completed.current) {
            completed.current = true;
            onCompletedRef.current();
          }
        },
        () => undefined, // Best effort: the next report carries the furthest position anyway.
      );
    };

    const onMessage = (message: MessageEvent) => {
      if (message.source !== frame.current?.contentWindow) return;
      const event = parsePlayerMessage(message.data);
      if (!event) return;
      if (event.kind === 'ready') {
        for (const command of playerCommands(track ? resumeAtSeconds : null)) {
          frame.current?.contentWindow?.postMessage(command, origin);
        }
        return;
      }
      if (event.kind === 'time') position.current = event.seconds;
      if (shouldReport(event, lastReport.current, Date.now())) report(position.current);
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (track && position.current > 0) report(position.current);
    };
    // resumeAtSeconds is read once per video load on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, track, client, courseId, lessonId]);

  if (error) {
    return (
      <Alert tone={error.processing ? 'info' : 'danger'}>
        {error.processing ? 'This video is still processing. Check back shortly.' : error.message}
      </Alert>
    );
  }
  if (!playback) {
    return (
      <div className={styles.videoFrame} aria-busy="true">
        <p className={styles.muted}>Loading video…</p>
      </div>
    );
  }
  return (
    <div className={styles.videoFrame}>
      <iframe
        ref={frame}
        src={playback.embedUrl}
        title={`Video: ${title}`}
        loading="lazy"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
