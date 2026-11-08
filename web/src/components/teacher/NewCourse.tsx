'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { teacherApi } from '@/lib/api/teacher';
import { CourseDetailsForm } from './CourseDetailsForm';
import styles from './Teacher.module.css';

/** #24: a new course starts as a DRAFT; content comes next. */
export function NewCourse() {
  const router = useRouter();
  return (
    <div className="stack">
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/teacher/courses">My courses</Link> / New course
      </nav>
      <h1>New course</h1>
      <p className="muted">
        Start with the details. You add sections, lessons and videos next, then submit the course
        for review.
      </p>
      <CourseDetailsForm
        submitLabel="Create course"
        onSubmit={async (body) => {
          const course = await teacherApi.createCourse(body);
          router.push(`/teacher/courses/${course.id}/content`);
        }}
      />
    </div>
  );
}
