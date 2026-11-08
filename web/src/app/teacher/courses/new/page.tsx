import type { Metadata } from 'next';
import { NewCourse } from '@/components/teacher/NewCourse';

export const metadata: Metadata = { title: 'New course' };

export default function NewCoursePage() {
  return <NewCourse />;
}
