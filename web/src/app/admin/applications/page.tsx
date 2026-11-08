import type { Metadata } from 'next';
import { ApplicationsScreen } from '@/components/admin/screens/ApplicationsScreen';

export const metadata: Metadata = { title: 'Teacher applications' };

export default function TeacherApplicationsPage() {
  return <ApplicationsScreen />;
}
