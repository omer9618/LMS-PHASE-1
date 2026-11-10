'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Alert, Badge, Button, PageHeader } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { teacherApi } from '@/lib/api/teacher';
import type { TeacherCourse } from '@/lib/api/schemas/teacher';
import { COURSE_STATUS } from '@/lib/course-status';
import { useApi } from '@/lib/use-api';
import styles from './Teacher.module.css';

interface Workspace {
  course: TeacherCourse;
  /** Replace the course after a change the API answered with the new course. */
  setCourse: (course: TeacherCourse) => void;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function useCourseWorkspace(): Workspace {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useCourseWorkspace must be used inside <CourseWorkspace>');
  return value;
}

/** Loads one of the teacher's courses and frames its pages (overview, content, students). */
export function CourseWorkspace({ courseId, children }: { courseId: string; children: ReactNode }) {
  const loaded = useApi(`teacher-course:${courseId}`, (signal) =>
    teacherApi.getCourse(courseId, signal),
  );
  // Changes made on these pages, newer than what was loaded.
  const [updated, setUpdated] = useState<TeacherCourse | null>(null);
  const pathname = usePathname() ?? '';

  if (loaded.status === 'loading') return <p role="status">Loading the course…</p>;
  if (loaded.status === 'error') {
    const missing = loaded.error.name === 'NOT_FOUND';
    return (
      <div className="stack">
        <h1>{missing ? 'Course not found' : 'Could not load the course'}</h1>
        <Alert tone={missing ? 'warning' : 'danger'}>
          {missing ? 'This course does not exist or is not yours.' : errorMessage(loaded.error)}
        </Alert>
        {!missing && (
          <Button variant="secondary" onClick={loaded.reload}>
            Try again
          </Button>
        )}
        <p>
          <Link href="/teacher/courses">Back to my courses</Link>
        </p>
      </div>
    );
  }

  const course = updated && updated.id === loaded.data.id ? updated : loaded.data;
  const base = `/teacher/courses/${course.id}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/content`, label: 'Content' },
    { href: `${base}/enrollments`, label: 'Students' },
  ];
  const status = COURSE_STATUS[course.status];

  return (
    <WorkspaceContext.Provider value={{ course, setCourse: setUpdated }}>
      <div className="stack">
        <PageHeader
          eyebrow={
            <nav aria-label="Breadcrumb">
              <Link href="/teacher/courses">My courses</Link> / {course.title}
            </nav>
          }
          title={course.title}
          actions={<Badge tone={status.tone}>{status.label}</Badge>}
        />
        <nav aria-label="Course sections">
          <ul className={styles.tabs}>
            {tabs.map((tab) => (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={styles.tab}
                  aria-current={pathname === tab.href ? 'page' : undefined}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {children}
      </div>
    </WorkspaceContext.Provider>
  );
}
