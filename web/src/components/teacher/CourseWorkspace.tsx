'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Alert, Badge, BackLink, Breadcrumb, Button, PageHeader, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { teacherApi } from '@/lib/api/teacher';
import type { TeacherCourse } from '@/lib/api/schemas/teacher';
import { COURSE_STATUS } from '@/lib/teacher/course-status';
import { usePageTitle } from '@/lib/use-page-title';
import { useQuery } from '@tanstack/react-query';
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

/** The Content tab also stays current inside a quiz of the course (a quiz is a lesson). */
function tabIsCurrent(pathname: string, href: string, base: string): boolean {
  if (pathname === href) return true;
  return href === `${base}/content` && pathname.startsWith(`${base}/quiz/`);
}

/** Loads one of the teacher's courses and frames its pages (overview, content, students). */
export function CourseWorkspace({ courseId, children }: { courseId: string; children: ReactNode }) {
  const loaded = useQuery({
    queryKey: ['teacher-course', courseId],
    queryFn: ({ signal }) => teacherApi.getCourse(courseId, signal),
  });
  // Changes made on these pages, newer than what was loaded.
  const [updated, setUpdated] = useState<TeacherCourse | null>(null);
  const pathname = usePathname() ?? '';
  const loadedTitle = loaded.status === 'success' ? loaded.data.title : null;
  const section = pathname.endsWith('/content')
    ? 'Content'
    : pathname.endsWith('/enrollments')
      ? 'Students'
      : pathname.includes('/quiz/')
        ? 'Quiz builder'
        : 'Overview';
  usePageTitle(loadedTitle && `${loadedTitle} · ${section} · Teaching`);

  if (loaded.status === 'pending') return <Skeleton label="Loading the course…" />;
  if (loaded.status === 'error') {
    const missing = loaded.error.name === 'NOT_FOUND';
    return (
      <div className="stack">
        <h1>{missing ? 'Course not found' : 'Could not load the course'}</h1>
        <Alert tone={missing ? 'warning' : 'danger'}>
          {missing ? 'This course does not exist or is not yours.' : errorMessage(loaded.error)}
        </Alert>
        {!missing && (
          <Button variant="secondary" onClick={() => void loaded.refetch()}>
            Try again
          </Button>
        )}
        <BackLink href="/teacher/courses">My courses</BackLink>
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
        <Breadcrumb
          items={[{ label: 'My courses', href: '/teacher/courses' }, { label: course.title }]}
        />
        <PageHeader
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
                  aria-current={tabIsCurrent(pathname, tab.href, base) ? 'page' : undefined}
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
