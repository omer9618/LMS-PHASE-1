import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseDetailView } from '@/components/course/CourseDetailView';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: 'Course' };

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!UUID.test(courseId)) notFound();
  return <CourseDetailView courseId={courseId} />;
}
