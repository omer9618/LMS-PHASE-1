'use client';

import { useState } from 'react';
import { Alert, Button, ButtonLink } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { CourseDetail, DashboardEntry } from '@/lib/api/types';
import { formatPrice } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import styles from './Course.module.css';

type Enroll = 'idle' | 'enrolling' | 'enrolled' | { error: string };

/** Price and the way in: free enrollment (#47) for free courses; paid checkout is M2. */
export function EnrollPanel({ course }: { course: CourseDetail }) {
  const { status, user } = useSession();
  const [enroll, setEnroll] = useState<Enroll>('idle');

  // Students see whether they already have this course (GET /me/enrollments).
  const enrollments = useApi(user ? `enrollments:${user.id}` : null, (signal) =>
    api.get<DashboardEntry[]>('/me/enrollments', undefined, signal),
  );
  const alreadyEnrolled =
    enrollments.status === 'success' &&
    enrollments.data.some((e) => e.course.id === course.id && e.access === 'ACTIVE');

  async function enrollFree() {
    setEnroll('enrolling');
    try {
      await api.post(`/courses/${course.id}/enroll`);
      setEnroll('enrolled');
    } catch (error) {
      setEnroll({ error: errorMessage(error) });
    }
  }

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
      ) : alreadyEnrolled || enroll === 'enrolled' ? (
        <Alert tone="success" title="You are enrolled">
          {enroll === 'enrolled' ? 'Welcome to the course. ' : ''}You have access to every lesson.
        </Alert>
      ) : !course.isFree ? (
        <Alert tone="info">
          Paid courses are bought by bank transfer. Online checkout is coming soon.
        </Alert>
      ) : status === 'signed-out' ? (
        <ButtonLink href={loginHref} fullWidth size="lg">
          Sign in to enroll for free
        </ButtonLink>
      ) : (
        <>
          <Button
            fullWidth
            size="lg"
            loading={enroll === 'enrolling' || status === 'loading'}
            loadingText={status === 'loading' ? 'Checking your account…' : 'Enrolling…'}
            onClick={() => void enrollFree()}
          >
            Enroll for free
          </Button>
          {typeof enroll === 'object' && (
            <Alert tone="danger" title="Could not enroll">
              {enroll.error}
            </Alert>
          )}
        </>
      )}
    </aside>
  );
}
