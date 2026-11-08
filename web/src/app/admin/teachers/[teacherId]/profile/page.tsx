import type { Metadata } from 'next';
import { ProfileModerationScreen } from '@/components/admin/screens/ProfileModerationScreen';

export const metadata: Metadata = { title: 'Teacher profile moderation' };

export default async function TeacherProfileModerationPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  return <ProfileModerationScreen teacherId={teacherId} />;
}
