'use client';

import { Alert } from '@/components/ui';
import { catalogueApi } from '@/lib/api/catalogue';
import { errorMessage } from '@/lib/api/errors';
import { useQuery } from '@tanstack/react-query';
import styles from './Course.module.css';

/**
 * Plays a free-preview lesson (the demo, #34). GET .../playback returns a short-lived signed
 * `embedUrl` (#37); it is fetched each time a lesson is chosen, so it never goes stale.
 */
export function DemoPlayer({
  courseId,
  lesson,
}: {
  courseId: string;
  lesson: { id: string; title: string };
}) {
  const playback = useQuery({
    queryKey: ['playback', courseId, lesson.id],
    queryFn: ({ signal }) => catalogueApi.demoPlayback(courseId, lesson.id, signal),
  });

  return (
    <div className={styles.player}>
      {playback.status === 'pending' && (
        <div className={styles.playerFrame}>
          <p className={styles.playerMessage}>Loading the preview…</p>
        </div>
      )}
      {playback.status === 'error' && (
        <Alert tone="danger" title="This preview cannot be played right now">
          {errorMessage(playback.error)}
        </Alert>
      )}
      {playback.status === 'success' && (
        <div className={styles.playerFrame}>
          <iframe
            src={playback.data.embedUrl}
            title={`Preview: ${lesson.title}`}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
