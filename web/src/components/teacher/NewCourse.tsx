'use client';

import { useRouter } from 'next/navigation';
import { teacherApi } from '@/lib/api/teacher';
import { CourseDetailsForm } from './CourseDetailsForm';
import { Breadcrumb, PageHeader } from '@/components/ui';
import styles from './Teacher.module.css';

/** #24: a new course starts as a DRAFT; content comes next. */
export function NewCourse() {
  const router = useRouter();
  return (
    <div className="stack">
      <Breadcrumb
        items={[{ label: 'My courses', href: '/teacher/courses' }, { label: 'New course' }]}
      />
      <PageHeader
        title="New course"
        description="Start with the details. You add sections, lessons and videos next, then submit the course for review."
      />
      <div className={styles.formCard}>
        <CourseDetailsForm
          submitLabel="Create course"
          onSubmit={async (body) => {
            const course = await teacherApi.createCourse(body);
            router.push(`/teacher/courses/${course.id}/content`);
          }}
        />
      </div>
    </div>
  );
}
