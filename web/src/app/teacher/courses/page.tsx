import type { Metadata } from 'next';
import { MyCourses } from '@/components/teacher/MyCourses';

export const metadata: Metadata = { title: 'My courses' };

export default function TeacherCoursesPage() {
  return <MyCourses />;
}
