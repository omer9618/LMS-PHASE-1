import type { Metadata } from 'next';
import { CoursesScreen } from '@/components/admin/screens/CoursesScreen';

export const metadata: Metadata = { title: 'Course review' };

export default function CourseReviewPage() {
  return <CoursesScreen />;
}
