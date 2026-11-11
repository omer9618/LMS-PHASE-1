'use client';

import { useState } from 'react';
import { BuyButtons } from '@/components/orders/BuyButtons';
import { Alert, Button, ButtonLink } from '@/components/ui';
import { enrollmentApi } from '@/lib/api/enrollment';
import { useMutation } from '@/lib/use-mutation';
import type { CourseDetail } from '@/lib/api/schemas/catalogue';
import { formatPrice } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useQuery } from '@tanstack/react-query';
import styles from './Course.module.css';

/** Whether the signed-in student already has this course (GET /me/enrollments, shared by queryKey). */
export function useAlreadyEnrolled(courseId: string): boolean {
  const { user } = useSession();
  const enrollments = useQuery({
    queryKey: ['enrollments', user?.id],
    queryFn: ({ signal }) => enrollmentApi.mine(signal),
    enabled: user !== null,
  });
  return (
    enrollments.status === 'success' &&
    enrollments.data.some((e) => e.course.id === courseId && e.access === 'ACTIVE')
  );
}

/** Price and the way in: free enrollment (#47) for free courses; cart and checkout (#54) for paid ones. */
export function EnrollPanel({ course }: { course: CourseDetail }) {
  const { status, user } = useSession();
  const enroll = useMutation();
  const [enrolled, setEnrolled] = useState(false);

  const alreadyEnrolled = useAlreadyEnrolled(course.id);

  const enrollFree = async () => {
    if (await enroll.run(() => enrollmentApi.enrollFree(course.id))) setEnrolled(true);
  };

  const loginHref = `/login?next=${encodeURIComponent(`/courses/${course.id}`)}`;

  return (
    <aside className={styles.enrollPanel} aria-labelledby="enroll-heading">
      <h2 id="enroll-heading" className="visually-hidden">
        Enrolment
      </h2>
      <p className={styles.bigPrice}>
        <span className="visually-hidden">Price: </span>
        {formatPrice(course)}
      </p>

      {user !== null && user.id === course.teacher.id ? (
        <Alert tone="info" title="You teach this course">
          <ButtonLink
            href={`/teacher/courses/${encodeURIComponent(course.id)}`}
            variant="secondary"
          >
            Manage course
          </ButtonLink>
        </Alert>
      ) : !course.isEnrollmentOpen ? (
        <Alert tone="warning">Enrolment for this course is closed at the moment.</Alert>
      ) : alreadyEnrolled || enrolled ? (
        <>
          <ButtonLink href={`/learn/${encodeURIComponent(course.id)}`} fullWidth size="lg">
            {enrolled ? 'Start learning' : 'Continue learning'}
          </ButtonLink>
          <Alert tone="success" title="You are enrolled">
            {enrolled ? 'Welcome to the course. ' : ''}You have access to every lesson.
          </Alert>
        </>
      ) : !course.isFree ? (
        <BuyButtons courseId={course.id} />
      ) : status === 'signed-out' ? (
        <ButtonLink href={loginHref} fullWidth size="lg">
          Sign in to enrol for free
        </ButtonLink>
      ) : (
        <>
          <Button
            fullWidth
            size="lg"
            loading={enroll.pending || status === 'loading'}
            loadingText={status === 'loading' ? 'Checking your account…' : 'Enrolling…'}
            onClick={() => void enrollFree()}
          >
            Enrol for free
          </Button>
          {enroll.error && (
            <Alert tone="danger" title="Could not enrol">
              {enroll.error}
            </Alert>
          )}
        </>
      )}
    </aside>
  );
}
