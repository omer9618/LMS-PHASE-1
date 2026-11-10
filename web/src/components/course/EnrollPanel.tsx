'use client';

import { useState } from 'react';
import { BuyButtons } from '@/components/orders/BuyButtons';
import { Alert, Button, ButtonLink } from '@/components/ui';
import { enrollmentApi } from '@/lib/api/enrollment';
import { useMutation } from '@/lib/use-mutation';
import type { CourseDetail } from '@/lib/api/schemas/catalogue';
import { formatPrice } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import styles from './Course.module.css';

/** Price and the way in: free enrollment (#47) for free courses; cart and checkout (#54) for paid ones. */
export function EnrollPanel({ course }: { course: CourseDetail }) {
  const { status, user } = useSession();
  const enroll = useMutation();
  const [enrolled, setEnrolled] = useState(false);

  // Students see whether they already have this course (GET /me/enrollments).
  const enrollments = useApi(user ? `enrollments:${user.id}` : null, (signal) =>
    enrollmentApi.mine(signal),
  );
  const alreadyEnrolled =
    enrollments.status === 'success' &&
    enrollments.data.some((e) => e.course.id === course.id && e.access === 'ACTIVE');

  const enrollFree = async () => {
    if (await enroll.run(() => enrollmentApi.enrollFree(course.id))) setEnrolled(true);
  };

  const loginHref = `/login?next=${encodeURIComponent(`/courses/${course.id}`)}`;

  return (
    <aside className={styles.enrollPanel} aria-labelledby="enroll-heading">
      <h2 id="enroll-heading" className="visually-hidden">
        Enrollment
      </h2>
      <p className={styles.bigPrice}>
        <span className="visually-hidden">Price: </span>
        {formatPrice(course)}
      </p>

      {!course.isEnrollmentOpen ? (
        <Alert tone="warning">Enrollment for this course is closed at the moment.</Alert>
      ) : alreadyEnrolled || enrolled ? (
        <Alert tone="success" title="You are enrolled">
          {enrolled ? 'Welcome to the course. ' : ''}You have access to every lesson.
        </Alert>
      ) : !course.isFree ? (
        <BuyButtons courseId={course.id} />
      ) : status === 'signed-out' ? (
        <ButtonLink href={loginHref} fullWidth size="lg">
          Sign in to enroll for free
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
            Enroll for free
          </Button>
          {enroll.error && (
            <Alert tone="danger" title="Could not enroll">
              {enroll.error}
            </Alert>
          )}
        </>
      )}
    </aside>
  );
}
