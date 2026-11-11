'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import type { LearnApi } from '@/lib/api/learn';
import { useMutation } from '@/lib/use-mutation';
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
  const loaded = useQuery({
    queryKey: ['lesson-content', courseId, lessonId],
    queryFn: () => client.content(courseId, lessonId),
  });
  const download = useMutation();
  const [downloading, setDownloading] = useState<string | null>(null);

  async function open(resourceId: string) {
    setDownloading(resourceId);
    await download.run(async () => {
      const { url } = await client.resourceDownload(courseId, lessonId, resourceId);
      window.location.assign(url);
    });
    setDownloading(null);
  }

  if (loaded.status === 'error') return <Alert tone="danger">{errorMessage(loaded.error)}</Alert>;
  if (loaded.status === 'pending') return <p className={styles.muted}>Loading…</p>;
  const content = loaded.data;
  return (
    <div className={styles.body}>
      {content.bodyText && <MathText text={content.bodyText} block className={styles.prose} />}
      {content.resources.length > 0 && (
        <section aria-labelledby={`files-${lessonId}`}>
          <h3 id={`files-${lessonId}`}>Files</h3>
          {download.error && <Alert tone="danger">{download.error}</Alert>}
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
                  onClick={() => void open(r.id)}
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
