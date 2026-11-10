import type { Metadata } from 'next';
import { CourseDetailView } from '@/components/course/CourseDetailView';
import { requireId } from '@/lib/route-params';

export const metadata: Metadata = { title: 'Course' };

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  requireId(courseId);
  return <CourseDetailView courseId={courseId} />;
}
