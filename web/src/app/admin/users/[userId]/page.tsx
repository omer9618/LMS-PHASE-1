import type { Metadata } from 'next';
import { UserDetailScreen } from '@/components/admin/screens/UserDetailScreen';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserDetailScreen userId={userId} />;
}
