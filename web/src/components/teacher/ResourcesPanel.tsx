'use client';

import { useState } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { teacherApi } from '@/lib/api/teacher';
import type { AuthoringLesson } from '@/lib/api/schemas/teacher';
import { formatBytes } from '@/lib/format';
import styles from './Outline.module.css';
import { RESOURCE_MAX_BYTES, resourceFile } from '@/lib/forms/teacher';

export function checkResource(file: File | null): string | undefined {
  const result = resourceFile.safeParse(file);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/** #38: PDF files attached to a lesson (downloads are enrollment-gated, #39). */
export function ResourcesPanel({
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The input is remounted after an upload so it shows no stale file name.
  const [inputKey, setInputKey] = useState(0);

  async function upload() {
    const problem = checkResource(file);
    setFileError(problem);
    setError(null);
    if (problem || !file) return;
    setBusy(true);
    try {
      await teacherApi.uploadResource(courseId, lesson.id, file);
      setFile(null);
      setInputKey((k) => k + 1);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(resourceId: string) {
    setError(null);
    try {
      await teacherApi.deleteResource(courseId, lesson.id, resourceId);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className={styles.subPanel} aria-label="Files">
      <h3 className={styles.subTitle}>Files (PDF)</h3>
      {lesson.resources.length === 0 ? (
        <p className="muted">No files attached.</p>
      ) : (
        <ul className={styles.files}>
          {lesson.resources.map((r) => (
            <li key={r.id} className={styles.row}>
              <span>{r.fileName}</span>
              <span className="muted">{formatBytes(r.fileSizeBytes)}</span>
              {editable && (
                <Button size="sm" variant="ghost" onClick={() => void remove(r.id)}>
                  Remove<span className="visually-hidden"> {r.fileName}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className={styles.inlineForm}>
          <Input
            key={inputKey}
            label="Attach a PDF"
            type="file"
            accept="application/pdf,.pdf"
            hint={`At most ${formatBytes(RESOURCE_MAX_BYTES)}. Only enrolled students can download it.`}
            error={fileError}
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null;
              setFile(chosen);
              setFileError(chosen ? checkResource(chosen) : undefined);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            loadingText="Uploading…"
            onClick={() => void upload()}
          >
            Attach
          </Button>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </section>
  );
}
