'use client';

import { useRef, useState } from 'react';
import { Alert, Badge, Button, Input } from '@/components/ui';
import { errorMessage, RequestAbortedError } from '@/lib/api/errors';
import { teacherApi } from '@/lib/api/teacher';
import type { AuthoringLesson } from '@/lib/api/schemas/teacher';
import { formatBytes, formatDuration } from '@/lib/format';
import { tusUpload, TusError } from '@/lib/tus';
import styles from './Outline.module.css';

/** The largest video the screen accepts before handing it to the video host. */
export const VIDEO_MAX_BYTES = 5 * 1024 * 1024 * 1024;

type Upload =
  | { kind: 'idle' }
  | { kind: 'uploading'; sent: number; total: number }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/**
 * #35/#36: the lesson's video. The file goes straight from the browser to the video host over
 * TUS with credentials from POST .../video; then the host processes it (PROCESSING → READY).
 */
export function VideoPanel({
  courseId,
  lesson,
  editable,
  onChanged,
}: {
  courseId: string;
  lesson: AuthoringLesson;
  editable: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [upload, setUpload] = useState<Upload>({ kind: 'idle' });
  const [checking, setChecking] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const video = lesson.videoAsset;

  async function start() {
    if (!file) {
      setFileError('Choose a video file');
      return;
    }
    if (!file.type.startsWith('video/')) {
      setFileError('Choose a video file (MP4, MOV, WebM…)');
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      setFileError(`The video must be at most ${formatBytes(VIDEO_MAX_BYTES)}`);
      return;
    }
    setFileError(undefined);
    abort.current = new AbortController();
    setUpload({ kind: 'uploading', sent: 0, total: file.size });
    try {
      const ticket = await teacherApi.startVideoUpload(courseId, lesson.id, lesson.title);
      await tusUpload(file, ticket.upload, {
        signal: abort.current.signal,
        onProgress: (sent, total) => setUpload({ kind: 'uploading', sent, total }),
      });
      setUpload({ kind: 'done' });
      setFile(null);
      await teacherApi.refreshVideo(courseId, lesson.id).catch(() => undefined);
      await onChanged();
    } catch (error) {
      if (
        error instanceof RequestAbortedError ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        setUpload({ kind: 'error', message: 'Upload cancelled.' });
      } else {
        setUpload({
          kind: 'error',
          message: error instanceof TusError ? error.message : errorMessage(error),
        });
      }
    } finally {
      abort.current = null;
    }
  }

  async function check() {
    setChecking(true);
    try {
      await teacherApi.refreshVideo(courseId, lesson.id);
      await onChanged();
    } catch (error) {
      setUpload({ kind: 'error', message: errorMessage(error) });
    } finally {
      setChecking(false);
    }
  }

  const percent =
    upload.kind === 'uploading' && upload.total > 0
      ? Math.floor((upload.sent / upload.total) * 100)
      : 0;

  return (
    <section className={styles.subPanel} aria-label="Video">
      <h3 className={styles.subTitle}>Video</h3>
      {video ? (
        <p className="cluster">
          {video.status === 'READY' && <Badge tone="success">Ready</Badge>}
          {video.status === 'PROCESSING' && <Badge tone="info">Processing</Badge>}
          {video.status === 'FAILED' && <Badge tone="danger">Processing failed</Badge>}
          {formatDuration(video.durationSeconds) && (
            <span className="muted">{formatDuration(video.durationSeconds)}</span>
          )}
          {video.status !== 'READY' && (
            <Button size="sm" variant="ghost" loading={checking} onClick={() => void check()}>
              Check status
            </Button>
          )}
        </p>
      ) : (
        <p className="muted">No video uploaded yet.</p>
      )}
      {editable && upload.kind !== 'uploading' && (
        <div className={styles.inlineForm}>
          <Input
            label={video ? 'Replace the video' : 'Upload a video'}
            type="file"
            accept="video/*"
            error={fileError}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setFileError(undefined);
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => void start()} disabled={!file}>
            Upload
          </Button>
        </div>
      )}
      {upload.kind === 'uploading' && (
        <div className="cluster">
          <progress
            max={100}
            value={percent}
            aria-label={`Uploading video: ${percent}%`}
            className={styles.progress}
          />
          <span>
            {percent}% ({formatBytes(upload.sent)} of {formatBytes(upload.total)})
          </span>
          <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        </div>
      )}
      <div role="status">
        {upload.kind === 'done' &&
          'Uploaded. The video host is processing it; this can take a few minutes.'}
      </div>
      {upload.kind === 'error' && <Alert tone="danger">{upload.message}</Alert>}
    </section>
  );
}
