import type { Metadata } from 'next';
import { ProfileEditor } from '@/components/teacher/ProfileEditor';

export const metadata: Metadata = { title: 'Public profile' };

export default function TeacherProfilePage() {
  return <ProfileEditor />;
}
