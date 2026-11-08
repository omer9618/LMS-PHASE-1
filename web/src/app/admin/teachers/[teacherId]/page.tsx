import type { Metadata } from 'next';
import { TeacherStatementScreen } from '@/components/admin/screens/FinanceScreens';

export const metadata: Metadata = { title: 'Teacher statement' };

export default async function TeacherStatementPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  return <TeacherStatementScreen teacherId={teacherId} />;
}
