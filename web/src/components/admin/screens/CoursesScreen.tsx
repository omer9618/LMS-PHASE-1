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
  SimplePager,
  SplitLayout,
  StatusBadge,
  Table,
  Textarea,
  Icon,
} from '@/components/ui';
import { adminApi, type AdminCourse } from '@/lib/api/admin';
import { submitChecklist } from '@/lib/api/teacher';
import type { CourseStatus } from '@/lib/api/schemas/enrollment';
import type { Outline } from '@/lib/api/schemas/teacher';
import type { Pacing } from '@/lib/api/schemas/catalogue';
import { formatBps } from '@/lib/money';
import { formatDate, PACING_LABELS } from '@/lib/format';
import { minorToMajorInput, minorUnitExponent } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { MutationStatus, ReasonAction } from '@/components/ui';
import { useMutation, type Mutation } from '@/lib/use-mutation';
import { formatDateTime } from '@/lib/format';
import { humanize } from '@/lib/format';
import { pricingForm } from '@/lib/forms/admin';
import { useZodForm } from '@/lib/use-zod-form';

const LIMIT = 50;
const STATUSES: CourseStatus[] = ['PENDING_APPROVAL', 'PUBLISHED', 'DRAFT', 'REJECTED', 'ARCHIVED'];

/** #28: the course review queue (awaiting approval by default, oldest first) and other states. */
export function CoursesScreen() {
  const [status, setStatus] = useState<CourseStatus>('PENDING_APPROVAL');
  const [offset, setOffset] = useState(0);
  const courses = useApi(`admin-courses:${status}:${offset}`, (signal) =>
    adminApi.listCoursesForReview({ status, limit: LIMIT, offset }, signal),
  );
  return (
    <>
      <PageHeader
        eyebrow="Awaiting approval · oldest first"
        title="Course review"
        description="Check the content, set the price and commission, then approve or send the course back."
      />
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
  const course = useApi(`admin-course:${courseId}`, (signal) =>
    adminApi.getCourse(courseId, signal),
  );
  const outline = useApi(`admin-outline:${courseId}`, (signal) =>
    adminApi.getCourseOutline(courseId, signal),
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
            eyebrow={
              <>
                <Link href="/admin/courses">Course review</Link> / {humanize(c.status)}
                {c.status === 'PENDING_APPROVAL' && ` · submitted ${formatDate(c.createdAt)}`}
              </>
            }
            title={c.title}
            description={
              <>
                by{' '}
                <Link href={`/admin/users/${c.teacher.id}`}>
                  {c.teacher.fullName || c.teacher.email}
                </Link>{' '}
                · {c.board.name} · {c.level.name} · {c.subject.name}
              </>
            }
            actions={<StatusBadge status={c.status} />}
          />
          <MutationStatus mutation={mutation} />
          <SplitLayout
            main={
              <>
                <Section title="Submission checklist">
                  <Loadable state={outline} what="the outline">
                    {(o) => (
                      <ul className={styles.checklist}>
                        {reviewChecklist(o).map((item) => (
                          <li key={item.label} data-done={item.done || undefined}>
                            <Icon name={item.done ? 'check' : 'alert'} />
                            <span>
                              {item.done ? '' : 'Needs a look: '}
                              {item.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Loadable>
                </Section>
                <Section title="Content">
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
                                    {l.isFreePreview && (
                                      <span className="muted">, free preview</span>
                                    )}
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
                      [
                        'Price',
                        c.isFree ? 'Free' : <Money minor={c.priceMinor} currency={c.currency} />,
                      ],
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
                <DetailsForm course={c} mutation={mutation} onSaved={course.reload} />
              </>
            }
            aside={
              <>
                <Section raised title="Decision">
                  <div className={styles.actions}>
                    {c.status === 'PENDING_APPROVAL' && (
                      <>
                        <Button
                          size="sm"
                          loading={mutation.pending}
                          onClick={() =>
                            act(
                              () => adminApi.approveCourse(c.id),
                              'Course approved and published.',
                            )
                          }
                        >
                          Approve and publish
                        </Button>
                        <ReasonAction
                          label="Reject"
                          variant="danger"
                          hint="Rejection is final. The teacher sees this reason."
                          minLength={1}
                          onConfirm={(reason) =>
                            act(() => adminApi.rejectCourse(c.id, reason), 'Course rejected.')
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
                          act(() => adminApi.unpublishCourse(c.id, reason), 'Course unpublished.')
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
                          act(
                            () => adminApi.archiveCourse(c.id, reason || undefined),
                            'Course archived.',
                          )
                        }
                      />
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        act(
                          () => adminApi.setCourseEnrollment(c.id, !c.isEnrollmentOpen),
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
              </>
            }
          />
          <p className="muted">
            <Link href={`/admin/enrollments?courseId=${c.id}`}>Enrollments in this course</Link> ·{' '}
            <Link href={`/admin/audit?entityId=${c.id}`}>Audit history</Link>
          </p>
        </>
      )}
    </Loadable>
  );
}

/** What a reviewer checks before approving, derived from the course's outline. */
export function reviewChecklist(outline: Outline): Array<{ label: string; done: boolean }> {
  const lessons = outline.sections.flatMap((s) => s.lessons);
  const videos = lessons.filter((l) => l.type === 'VIDEO');
  return [
    ...submitChecklist(outline),
    {
      label: 'Every video is ready to play',
      done: videos.every((l) => l.videoAsset?.status === 'READY'),
    },
    {
      label: 'Every video lesson has a video',
      done: videos.every((l) => l.videoAsset !== null),
    },
  ];
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
  const proposed = course.commissionRateBps ?? course.teacherProposedBps;
  const form = useZodForm(pricingForm, {
    isFree: course.isFree,
    currency: course.currency ?? 'PKR',
    price: course.priceMinor
      ? minorToMajorInput(course.priceMinor, minorUnitExponent(course.currency))
      : '',
    commission: proposed !== null ? formatBps(proposed).replace('%', '') : '',
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = form.check();
    if (!body) return;
    if (await mutation.run(() => adminApi.setCoursePricing(course.id, body), 'Pricing saved.'))
      onSaved();
  }

  return (
    <Section title="Pricing and commission">
      <form className={styles.form} onSubmit={submit} noValidate>
        <Checkbox label="Free course" {...form.bindCheck('isFree')} />
        {!form.values.isFree && (
          <div className={styles.filters}>
            <Input label="Price" inputMode="decimal" {...form.bind('price')} />
            <Input label="Currency" maxLength={3} {...form.bind('currency')} />
            <Input
              label="Commission %"
              inputMode="decimal"
              hint={`Teacher proposed ${formatBps(course.teacherProposedBps)}`}
              {...form.bind('commission')}
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
        adminApi.updateCourse(course.id, {
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
