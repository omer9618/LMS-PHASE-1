'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Checkbox, Input } from '@/components/ui';
import { errorMessage, isApiError } from '@/lib/api/errors';
import { submitChecklist, teacherApi } from '@/lib/api/teacher';
import type { TeacherCourse } from '@/lib/api/schemas/teacher';
import { canArchive, canSubmit, detailsEditable, detailsLockReason } from '@/lib/course-status';
import { formatDate, PACING_LABELS } from '@/lib/format';
import { formatPrice } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import { ConfirmButton } from '@/components/ui';
import { CourseDetailsForm } from './CourseDetailsForm';
import { useCourseWorkspace } from './CourseWorkspace';
import styles from './Teacher.module.css';
import { proposalForm } from '@/lib/forms/admin';
import { validateForm } from '@/lib/zod-form';

/** What the API's `missing` codes (COURSE_INCOMPLETE, #34) mean, in the teacher's words. */
export const MISSING_LABELS: Record<string, string> = {
  freePreviewVideoLesson:
    'Mark at least one video lesson with an uploaded video as a free preview: it is the demo students see before enrolling.',
  priceMinor: 'A price has to be set (an admin sets it during review).',
  commissionRateBps: 'A commission rate has to be set (an admin sets it during review).',
};

/** The server's checklist errors from a refused submission, as sentences. */
export function submissionProblems(error: unknown): string[] {
  if (!isApiError(error)) return [errorMessage(error)];
  const info = error.info as { missing?: unknown } | undefined;
  const missing = Array.isArray(info?.missing) ? info.missing.map(String) : [];
  if (missing.length > 0) return missing.map((code) => MISSING_LABELS[code] ?? code);
  return [errorMessage(error)];
}

export function CourseOverview() {
  const { course, setCourse } = useCourseWorkspace();
  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="details-heading">
        <h2 id="details-heading" className={styles.panelTitle}>
          Details
        </h2>
        {detailsEditable(course.status) ? (
          <CourseDetailsForm
            key={course.id}
            course={course}
            submitLabel="Save details"
            onSubmit={async (body) => setCourse(await teacherApi.updateCourse(course.id, body))}
          />
        ) : (
          <ReadOnlyDetails course={course} />
        )}
      </section>
      <div className="stack">
        <StatusPanel course={course} setCourse={setCourse} />
        {course.status === 'DRAFT' && <SubmitPanel course={course} setCourse={setCourse} />}
        <ManagePanel course={course} setCourse={setCourse} />
      </div>
    </div>
  );
}

function ReadOnlyDetails({ course }: { course: TeacherCourse }) {
  return (
    <>
      <Alert tone="info">{detailsLockReason(course.status)}</Alert>
      <dl className={styles.facts}>
        <div>
          <dt>Title</dt>
          <dd>{course.title}</dd>
        </div>
        <div>
          <dt>Classification</dt>
          <dd>
            {course.subject.name} · {course.board.name} · {course.level.name}
          </dd>
        </div>
        <div>
          <dt>Syllabus area</dt>
          <dd>{course.syllabusArea ?? '—'}</dd>
        </div>
        <div>
          <dt>Pacing</dt>
          <dd>{PACING_LABELS[course.progressionMode]}</dd>
        </div>
        <div className={styles.wide}>
          <dt>Description</dt>
          <dd>{course.description ?? '—'}</dd>
        </div>
      </dl>
    </>
  );
}

function StatusPanel({ course }: { course: TeacherCourse; setCourse: (c: TeacherCourse) => void }) {
  return (
    <section className={styles.panel} aria-labelledby="status-heading">
      <h2 id="status-heading" className={styles.panelTitle}>
        Status
      </h2>
      {course.status === 'DRAFT' && (
        <p>Draft. Add content, then submit the course for review when it is ready.</p>
      )}
      {course.status === 'PENDING_APPROVAL' && (
        <Alert tone="info" title="In review">
          An admin is reviewing the course and will set its price. Content is locked until then.
        </Alert>
      )}
      {course.status === 'PUBLISHED' && (
        <p>Published {formatDate(course.publishedAt)}. Students can find it in the catalogue.</p>
      )}
      {course.status === 'REJECTED' && (
        <Alert tone="danger" title="Rejected">
          <p>{course.rejectionReason ?? 'No reason was recorded.'}</p>
          <p className="muted">A rejection is final: this course cannot be resubmitted.</p>
        </Alert>
      )}
      {course.status === 'ARCHIVED' && (
        <Alert tone="warning">
          Archived {formatDate(course.archivedAt)}. Hidden from the catalogue; enrolled students
          keep access.
        </Alert>
      )}
      <dl className={styles.facts}>
        <div>
          <dt>Price</dt>
          <dd>
            {course.isFree || course.priceMinor ? formatPrice(course) : 'Set by an admin in review'}
          </dd>
        </div>
        <div>
          <dt>Enrollment</dt>
          <dd>{course.isEnrollmentOpen ? 'Open' : 'Closed'}</dd>
        </div>
      </dl>
      {course.status === 'PUBLISHED' && (
        <p>
          <Link href={`/courses/${course.id}`}>View in the catalogue</Link>
        </p>
      )}
    </section>
  );
}

function SubmitPanel({
  course,
  setCourse,
}: {
  course: TeacherCourse;
  setCourse: (c: TeacherCourse) => void;
}) {
  const outline = useApi(`outline-check:${course.id}`, (signal) =>
    teacherApi.getOutline(course.id, signal),
  );
  const [proposal, setProposal] = useState('');
  const [proposalError, setProposalError] = useState<string | undefined>();
  const [problems, setProblems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const checklist = submitChecklist(outline.status === 'success' ? outline.data : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(proposalForm, { proposal });
    if (!checked.ok) {
      setProposalError(checked.errors.proposal);
      return;
    }
    const bps = checked.data.proposal;
    setProposalError(undefined);
    setProblems([]);
    setSubmitting(true);
    try {
      setCourse(await teacherApi.submitCourse(course.id, bps));
    } catch (error) {
      setProblems(submissionProblems(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="submit-heading">
      <h2 id="submit-heading" className={styles.panelTitle}>
        Submit for review
      </h2>
      <ul className={styles.checklist} aria-label="Before you submit">
        {checklist.map((item) => (
          <li key={item.label} className={item.done ? styles.done : styles.todo}>
            <span aria-hidden="true">{item.done ? '✓ ' : '✗ '}</span>
            <span className="visually-hidden">{item.done ? 'Done: ' : 'To do: '}</span>
            {item.label}
          </li>
        ))}
      </ul>
      {problems.length > 0 && (
        <Alert tone="danger" title="The course cannot be submitted yet">
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      <form noValidate onSubmit={submit} className="stack">
        <Input
          label="Proposed commission (optional)"
          hint="Your suggestion for the platform’s share, in %. The admin decides."
          inputMode="decimal"
          value={proposal}
          onChange={(e) => setProposal(e.target.value)}
          error={proposalError}
        />
        <Button type="submit" loading={submitting} loadingText="Submitting…">
          Submit for review
        </Button>
      </form>
    </section>
  );
}

function ManagePanel({
  course,
  setCourse,
}: {
  course: TeacherCourse;
  setCourse: (c: TeacherCourse) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const showToggle = course.status === 'PUBLISHED' || course.status === 'DRAFT';

  if (!showToggle && !canArchive(course.status) && !canSubmit(course.status)) return null;

  return (
    <section className={styles.panel} aria-labelledby="manage-heading">
      <h2 id="manage-heading" className={styles.panelTitle}>
        Manage
      </h2>
      {error && <Alert tone="danger">{error}</Alert>}
      {showToggle && (
        <Checkbox
          label="Open for new enrollments"
          hint="Closing stops new students joining; enrolled students keep access."
          checked={course.isEnrollmentOpen}
          disabled={toggling}
          onChange={async (e) => {
            const open = e.target.checked;
            setToggling(true);
            setError(null);
            try {
              setCourse(await teacherApi.setEnrollmentOpen(course.id, open));
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setToggling(false);
            }
          }}
        />
      )}
      <div className={styles.actions}>
        {canArchive(course.status) && (
          <ConfirmButton
            question="Archive this course?"
            confirmLabel="Archive"
            onConfirm={async () => {
              setError(null);
              try {
                setCourse(await teacherApi.archiveCourse(course.id));
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            Archive course
          </ConfirmButton>
        )}
        {(course.status === 'DRAFT' || course.status === 'REJECTED') && (
          <ConfirmButton
            question="Delete this course for good?"
            confirmLabel="Delete"
            onConfirm={async () => {
              setError(null);
              try {
                await teacherApi.deleteCourse(course.id);
                router.push('/teacher/courses');
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            Delete course
          </ConfirmButton>
        )}
      </div>
    </section>
  );
}
