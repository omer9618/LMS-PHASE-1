'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { teacherApi } from '@/lib/api/teacher';
import { CourseDetailsForm } from './CourseDetailsForm';
import { PageHeader } from '@/components/ui';

/** #24: a new course starts as a DRAFT; content comes next. */
export function NewCourse() {
  const router = useRouter();
  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <>
            <Link href="/teacher/courses">My courses</Link> / New course
          </>
        }
        title="New course"
        description="Start with the details. You add sections, lessons and videos next, then submit the course for review."
      />
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
