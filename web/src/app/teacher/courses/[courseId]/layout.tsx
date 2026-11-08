import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CourseWorkspace } from '@/components/teacher/CourseWorkspace';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TeacherCourseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  if (!UUID.test(courseId)) notFound();
  return <CourseWorkspace courseId={courseId}>{children}</CourseWorkspace>;
}
