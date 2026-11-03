'use client';

import { useEffect, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import type { LearnApi, LessonContent } from '@/lib/api/learn';
import { MathText } from './MathText';
import styles from './Player.module.css';

export interface LessonBodyProps {
  courseId: string;
  lessonId: string;
  client: LearnApi;
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(Math.round((bytes / 1024 / 1024) * 10) / 10).toString()} MB`;
}

/** #53: a lesson's text (with notation) and its downloadable files. */
export function LessonBody({ courseId, lessonId, client }: LessonBodyProps) {
  const [content, setContent] = useState<LessonContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    // Mounted once per lesson (keyed by lesson id), so there is no previous lesson to clear.
    let cancelled = false;
    client.content(courseId, lessonId).then(
      (c) => !cancelled && setContent(c),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [client, courseId, lessonId]);

  async function download(resourceId: string) {
    setDownloading(resourceId);
    try {
      const { url } = await client.resourceDownload(courseId, lessonId, resourceId);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDownloading(null);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!content) return <p className={styles.muted}>Loading…</p>;
  return (
    <div className={styles.body}>
      {content.bodyText && <MathText text={content.bodyText} block className={styles.prose} />}
      {content.resources.length > 0 && (
        <section aria-labelledby={`files-${lessonId}`}>
          <h3 id={`files-${lessonId}`}>Files</h3>
          <ul className={styles.files}>
            {content.resources.map((r) => (
              <li key={r.id}>
                <span>
                  {r.fileName}
                  {formatSize(r.fileSizeBytes) && (
                    <span className={styles.muted}> · {formatSize(r.fileSizeBytes)}</span>
                  )}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => download(r.id)}
                  loading={downloading === r.id}
                  loadingText="Preparing…"
                >
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!content.bodyText && content.resources.length === 0 && (
        <p className={styles.muted}>This lesson has no content yet.</p>
      )}
    </div>
  );
}
