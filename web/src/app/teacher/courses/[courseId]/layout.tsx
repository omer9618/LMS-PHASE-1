import type { ReactNode } from 'react';
import { CourseWorkspace } from '@/components/teacher/CourseWorkspace';
import { requireId } from '@/lib/route-params';

export default async function TeacherCourseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  requireId(courseId);
  return <CourseWorkspace courseId={courseId}>{children}</CourseWorkspace>;
}
