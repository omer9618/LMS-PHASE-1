'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Input, Select, Textarea } from '@/components/ui';
import { catalogueApi } from '@/lib/api/catalogue';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import type { CourseDetailsInput } from '@/lib/api/teacher';
import type { Pacing, TeacherCourse } from '@/lib/api/types';
import { PACING_HINTS, PACING_LABELS } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { courseDetailsForm } from '@/lib/forms/course';
import { validateForm } from '@/lib/zod-form';
import styles from './Teacher.module.css';

export interface DetailsValues {
  boardId: string;
  levelId: string;
  subjectId: string;
  title: string;
  syllabusArea: string;
  description: string;
  progressionMode: Pacing;
}

export function initialValues(course?: TeacherCourse): DetailsValues {
  return {
    boardId: course?.boardId ?? '',
    levelId: course?.levelId ?? '',
    subjectId: course?.subjectId ?? '',
    title: course?.title ?? '',
    syllabusArea: course?.syllabusArea ?? '',
    description: course?.description ?? '',
    progressionMode: course?.progressionMode ?? 'FREE',
  };
}

export function validateDetails(values: DetailsValues): Record<string, string> {
  const result = validateForm(courseDetailsForm, values);
  return result.ok ? {} : result.errors;
}

/**
 * The body to send: everything when creating; only what changed when editing, with board, level
 * and subject always together (the API validates them as one classification).
 */
export function detailsBody(values: DetailsValues, course?: TeacherCourse): CourseDetailsInput {
  const full: CourseDetailsInput = {
    boardId: values.boardId,
    levelId: values.levelId,
    subjectId: values.subjectId,
    title: values.title.trim(),
    syllabusArea: values.syllabusArea.trim() || null,
    description: values.description.trim() || null,
    progressionMode: values.progressionMode,
  };
  if (!course) {
    if (!full.syllabusArea) delete full.syllabusArea;
    if (!full.description) delete full.description;
    return full;
  }
  const before = detailsBody(initialValues(course));
  const changed: CourseDetailsInput = {};
  if (
    full.boardId !== course.boardId ||
    full.levelId !== course.levelId ||
    full.subjectId !== course.subjectId
  ) {
    changed.boardId = full.boardId;
    changed.levelId = full.levelId;
    changed.subjectId = full.subjectId;
  }
  if (full.title !== course.title) changed.title = full.title;
  if (full.syllabusArea !== (before.syllabusArea ?? null)) changed.syllabusArea = full.syllabusArea;
  if (full.description !== (before.description ?? null)) changed.description = full.description;
  if (full.progressionMode !== course.progressionMode) {
    changed.progressionMode = full.progressionMode;
  }
  return changed;
}

/** #24 create and #26 edit of a course's details. */
export function CourseDetailsForm({
  course,
  submitLabel,
  onSubmit,
}: {
  course?: TeacherCourse;
  submitLabel: string;
  onSubmit: (body: CourseDetailsInput) => Promise<void>;
}) {
  const [values, setValues] = useState<DetailsValues>(() => initialValues(course));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const boards = useApi('boards', (signal) => catalogueApi.boards(signal));
  const subjects = useApi('subjects', (signal) => catalogueApi.allSubjects(signal));
  const levels = useApi(values.boardId ? `levels:${values.boardId}` : null, (signal) =>
    catalogueApi.levels(values.boardId, signal),
  );

  const set = (key: keyof DetailsValues, value: string) => {
    setSaved(false);
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (key === 'boardId' && value !== v.boardId) next.levelId = '';
      return next;
    });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateDetails(values);
    setErrors(invalid);
    setFormError(null);
    setSaved(false);
    if (Object.keys(invalid).length > 0) return;
    const body = detailsBody(values, course);
    if (course && Object.keys(body).length === 0) {
      setSaved(true);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(body);
      setSaved(true);
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="stack" aria-label="Course details">
      {formError && <Alert tone="danger">{formError}</Alert>}
      {saved && course && <Alert tone="success">Details saved.</Alert>}
      <div className={styles.grid}>
        <Input
          label="Title"
          className={styles.wide}
          value={values.title}
          maxLength={200}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
          required
        />
        <Select
          label="Exam board"
          value={values.boardId}
          onChange={(e) => set('boardId', e.target.value)}
          error={errors.boardId}
          required
        >
          <option value="">Choose…</option>
          {(boards.status === 'success' ? boards.data : []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select
          label="Level"
          value={values.levelId}
          disabled={!values.boardId}
          hint={values.boardId ? undefined : 'Choose an exam board first'}
          onChange={(e) => set('levelId', e.target.value)}
          error={errors.levelId}
          required
        >
          <option value="">Choose…</option>
          {(levels.status === 'success' ? levels.data : []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select
          label="Subject"
          value={values.subjectId}
          onChange={(e) => set('subjectId', e.target.value)}
          error={errors.subjectId}
          required
        >
          <option value="">Choose…</option>
          {(subjects.status === 'success' ? subjects.data : []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input
          label="Syllabus area (optional)"
          hint="For example: Paper 1, Mechanics"
          value={values.syllabusArea}
          maxLength={200}
          onChange={(e) => set('syllabusArea', e.target.value)}
          error={errors.syllabusArea}
        />
        <Select
          label="Pacing"
          value={values.progressionMode}
          hint={PACING_HINTS[values.progressionMode]}
          onChange={(e) => set('progressionMode', e.target.value)}
          error={errors.progressionMode}
        >
          {(Object.keys(PACING_LABELS) as Pacing[]).map((p) => (
            <option key={p} value={p}>
              {PACING_LABELS[p]}
            </option>
          ))}
        </Select>
        <Textarea
          label="Description (optional)"
          className={styles.wide}
          rows={6}
          maxLength={5000}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          error={errors.description}
        />
      </div>
      <div className={styles.actions}>
        <Button type="submit" loading={submitting} loadingText="Saving…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
