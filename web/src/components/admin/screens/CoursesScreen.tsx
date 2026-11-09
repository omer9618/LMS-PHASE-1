'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Checkbox,
  Facts,
  Input,
  Loadable,
  Money,
  PageHeader,
  Section,
  Select,
  StatusBadge,
  Table,
  Textarea,
} from '@/components/ui';
import {
  approveCourse,
  archiveCourse,
  getCourse,
  getCourseOutline,
  listCoursesForReview,
  rejectCourse,
  setCourseEnrollment,
  setCoursePricing,
  unpublishCourse,
  updateCourse,
  type AdminCourse,
} from '@/lib/api/admin';
import type { CourseStatus, Pacing } from '@/lib/api/types';
import { formatBps, percentToBps } from '@/lib/admin/format';
import { formatDate, PACING_LABELS } from '@/lib/format';
import { minorToMajorInput, minorUnitExponent, parseMajorToMinor } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import {
  formatDateTime,
  MutationStatus,
  ReasonAction,
  SimplePager,
  useMutation,
  type Mutation,
} from '../kit';
import { humanize } from '@/lib/format';

const LIMIT = 50;
const STATUSES: CourseStatus[] = ['PENDING_APPROVAL', 'PUBLISHED', 'DRAFT', 'REJECTED', 'ARCHIVED'];

/** #28: the course review queue (awaiting approval by default, oldest first) and other states. */
export function CoursesScreen() {
  const [status, setStatus] = useState<CourseStatus>('PENDING_APPROVAL');
  const [offset, setOffset] = useState(0);
  const courses = useApi(`admin-courses:${status}:${offset}`, (signal) =>
    listCoursesForReview({ status, limit: LIMIT, offset }, signal),
  );
  return (
    <>
      <PageHeader title="Course review" description="Courses awaiting approval are oldest first." />
      <div className={styles.filters}>
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as CourseStatus);
            setOffset(0);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>
      <Loadable state={courses} what="courses">
        {(rows) => (
          <>
            <Table<AdminCourse>
              caption={`${humanize(status)} courses`}
              rows={rows}
              rowKey={(c) => c.id}
              empty="Nothing here."
              columns={[
                {
                  key: 'title',
                  header: 'Course',
                  rowHeader: true,
                  cell: (c) => <Link href={`/admin/courses/${c.id}`}>{c.title}</Link>,
                },
                {
                  key: 'teacher',
                  header: 'Teacher',
                  cell: (c) => (
                    <Link href={`/admin/users/${c.teacher.id}`}>
                      {c.teacher.fullName || c.teacher.email}
                    </Link>
                  ),
                },
                {
                  key: 'class',
                  header: 'Board / level / subject',
                  cell: (c) => `${c.board.name} · ${c.level.name} · ${c.subject.name}`,
                },
                {
                  key: 'proposed',
                  header: 'Proposed commission',
                  numeric: true,
                  cell: (c) => formatBps(c.teacherProposedBps),
                },
                { key: 'created', header: 'Created', cell: (c) => formatDate(c.createdAt) },
              ]}
            />
            <SimplePager
              hasMore={rows.length === LIMIT}
              limit={LIMIT}
              offset={offset}
              onChange={setOffset}
            />
          </>
        )}
      </Loadable>
    </>
  );
}

/** #28–#33: one course: decide, price, unpublish or archive, edit details, see the outline. */
export function CourseDetailScreen({ courseId }: { courseId: string }) {
  const course = useApi(`admin-course:${courseId}`, (signal) => getCourse(courseId, signal));
  const outline = useApi(`admin-outline:${courseId}`, (signal) =>
    getCourseOutline(courseId, signal),
  );
  const mutation = useMutation();
  const act = async (action: () => Promise<unknown>, success: string) => {
    const ok = await mutation.run(action, success);
    if (ok) course.reload();
    return ok;
  };

  return (
    <Loadable state={course} what="the course">
      {(c) => (
        <>
          <PageHeader
            title={c.title}
            description={
              <>
                by{' '}
                <Link href={`/admin/users/${c.teacher.id}`}>
                  {c.teacher.fullName || c.teacher.email}
                </Link>
              </>
            }
            actions={<StatusBadge status={c.status} />}
          />
          <MutationStatus mutation={mutation} />
          <Section title="Details">
            <Facts
              items={[
                [
                  'Board / level / subject',
                  `${c.board.name} · ${c.level.name} · ${c.subject.name}`,
                ],
                ['Syllabus area', c.syllabusArea],
                ['Pacing', PACING_LABELS[c.progressionMode]],
                ['Audience', c.audienceType === 'TEACHER_PD' ? 'Teacher PD' : 'Students'],
                ['Price', c.isFree ? 'Free' : <Money minor={c.priceMinor} currency={c.currency} />],
                ['Commission', formatBps(c.commissionRateBps)],
                ['Teacher proposed', formatBps(c.teacherProposedBps)],
                ['Enrollment', c.isEnrollmentOpen ? 'Open' : 'Closed'],
                ['Created', formatDateTime(c.createdAt)],
                ['Published', formatDateTime(c.publishedAt)],
                ['Rejection reason', c.rejectionReason],
              ]}
            />
            {c.description && <p>{c.description}</p>}
          </Section>

          <Section title="Decision">
            <div className={styles.actions}>
              {c.status === 'PENDING_APPROVAL' && (
                <>
                  <Button
                    size="sm"
                    loading={mutation.pending}
                    onClick={() => act(() => approveCourse(c.id), 'Course approved and published.')}
                  >
                    Approve and publish
                  </Button>
                  <ReasonAction
                    label="Reject"
                    variant="danger"
                    hint="Rejection is final. The teacher sees this reason."
                    minLength={1}
                    onConfirm={(reason) =>
                      act(() => rejectCourse(c.id, reason), 'Course rejected.')
                    }
                  />
                </>
              )}
              {c.status === 'PUBLISHED' && (
                <ReasonAction
                  label="Unpublish"
                  variant="danger"
                  hint="Returns the course to draft. The teacher receives this reason."
                  minLength={1}
                  onConfirm={(reason) =>
                    act(() => unpublishCourse(c.id, reason), 'Course unpublished.')
                  }
                />
              )}
              {c.status !== 'ARCHIVED' && (
                <ReasonAction
                  label="Archive"
                  optional
                  reasonLabel="Reason (optional)"
                  hint="Enrolled students keep their access."
                  onConfirm={(reason) =>
                    act(() => archiveCourse(c.id, reason || undefined), 'Course archived.')
                  }
                />
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  act(
                    () => setCourseEnrollment(c.id, !c.isEnrollmentOpen),
                    c.isEnrollmentOpen ? 'Enrollment closed.' : 'Enrollment opened.',
                  )
                }
              >
                {c.isEnrollmentOpen ? 'Close enrollment' : 'Open enrollment'}
              </Button>
            </div>
          </Section>

          {(c.status === 'PENDING_APPROVAL' || c.status === 'PUBLISHED') && (
            <PricingForm course={c} mutation={mutation} onSaved={course.reload} />
          )}
          <DetailsForm course={c} mutation={mutation} onSaved={course.reload} />

          <Section title="Outline">
            <Loadable state={outline} what="the outline">
              {(o) =>
                o.sections.length === 0 ? (
                  <p className="muted">No sections yet.</p>
                ) : (
                  <ol className={styles.list}>
                    {o.sections.map((s) => (
                      <li key={s.id}>
                        <strong>{s.title}</strong>
                        <ol className={styles.list}>
                          {s.lessons.map((l) => (
                            <li key={l.id}>
                              {l.title} <span className="muted">({humanize(l.type)}</span>
                              {l.isFreePreview && <span className="muted">, free preview</span>}
                              {l.videoAsset && (
                                <span className="muted">
                                  , video {humanize(l.videoAsset.status)}
                                </span>
                              )}
                              <span className="muted">)</span>
                            </li>
                          ))}
                        </ol>
                      </li>
                    ))}
                  </ol>
                )
              }
            </Loadable>
          </Section>
          <p className="muted">
            <Link href={`/admin/enrollments?courseId=${c.id}`}>Enrollments in this course</Link> ·{' '}
            <Link href={`/admin/audit?entityId=${c.id}`}>Audit history</Link>
          </p>
        </>
      )}
    </Loadable>
  );
}

/** #29: free, or price + currency + commission together. */
function PricingForm({
  course,
  mutation,
  onSaved,
}: {
  course: AdminCourse;
  mutation: Mutation;
  onSaved: () => void;
}) {
  const [isFree, setIsFree] = useState(course.isFree);
  const [currency, setCurrency] = useState(course.currency ?? 'PKR');
  const [price, setPrice] = useState(
    course.priceMinor
      ? minorToMajorInput(course.priceMinor, minorUnitExponent(course.currency))
      : '',
  );
  const [commission, setCommission] = useState(
    course.commissionRateBps !== null
      ? formatBps(course.commissionRateBps).replace('%', '')
      : course.teacherProposedBps !== null
        ? formatBps(course.teacherProposedBps).replace('%', '')
        : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isFree) {
      if (await mutation.run(() => setCoursePricing(course.id, { isFree: true }), 'Pricing saved.'))
        onSaved();
      return;
    }
    const code = currency.trim().toUpperCase();
    const priceMinor = parseMajorToMinor(price, minorUnitExponent(code));
    const bps = percentToBps(commission);
    const next: Record<string, string> = {};
    if (!/^[A-Z]{3}$/.test(code)) next.currency = 'A 3-letter currency code, e.g. PKR.';
    if (!priceMinor || /^0+$/.test(priceMinor)) next.price = 'Enter a price above zero.';
    if (bps === null) next.commission = 'A percentage from 0 to 100.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const ok = await mutation.run(
      () =>
        setCoursePricing(course.id, {
          isFree: false,
          priceMinor: priceMinor!,
          currency: code,
          commissionRateBps: bps!,
        }),
      'Pricing saved.',
    );
    if (ok) onSaved();
  }

  return (
    <Section title="Pricing and commission">
      <form className={styles.form} onSubmit={submit}>
        <Checkbox
          label="Free course"
          checked={isFree}
          onChange={(e) => setIsFree(e.target.checked)}
        />
        {!isFree && (
          <div className={styles.filters}>
            <Input
              label="Price"
              inputMode="decimal"
              value={price}
              error={errors.price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <Input
              label="Currency"
              value={currency}
              maxLength={3}
              error={errors.currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
            <Input
              label="Commission %"
              inputMode="decimal"
              value={commission}
              error={errors.commission}
              hint={`Teacher proposed ${formatBps(course.teacherProposedBps)}`}
              onChange={(e) => setCommission(e.target.value)}
            />
          </div>
        )}
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Save pricing
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** #33: admins can edit course details in any state. */
function DetailsForm({
  course,
  mutation,
  onSaved,
}: {
  course: AdminCourse;
  mutation: Mutation;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [syllabusArea, setSyllabusArea] = useState(course.syllabusArea ?? '');
  const [description, setDescription] = useState(course.description ?? '');
  const [pacing, setPacing] = useState<Pacing>(course.progressionMode);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await mutation.run(
      () =>
        updateCourse(course.id, {
          title: title.trim(),
          syllabusArea: syllabusArea.trim() || null,
          description: description.trim() || null,
          progressionMode: pacing,
        }),
      'Course details saved.',
    );
    if (ok) onSaved();
  }

  return (
    <Section title="Edit details">
      <form className={styles.form} onSubmit={submit}>
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Syllabus area"
          value={syllabusArea}
          onChange={(e) => setSyllabusArea(e.target.value)}
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select label="Pacing" value={pacing} onChange={(e) => setPacing(e.target.value as Pacing)}>
          <option value="FREE">{PACING_LABELS.FREE}</option>
          <option value="SEQUENTIAL">{PACING_LABELS.SEQUENTIAL}</option>
        </Select>
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Save details
          </Button>
        </div>
      </form>
    </Section>
  );
}
