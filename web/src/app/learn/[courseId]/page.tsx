import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CoursePlayer } from '@/components/learn/CoursePlayer';

export const metadata: Metadata = { title: 'Course player' };

/** #53 course player and #75 quiz taking, for enrolled students (and staff previewing). */
export default async function LearnCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <Suspense fallback={null}>
      <CoursePlayer courseId={courseId} />
    </Suspense>
  );
}
