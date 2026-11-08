import type { Metadata } from 'next';
import { ApplicationDetailScreen } from '@/components/admin/screens/ApplicationsScreen';

export const metadata: Metadata = { title: 'Teacher application' };

export default async function TeacherApplicationPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <ApplicationDetailScreen applicationId={applicationId} />;
}
