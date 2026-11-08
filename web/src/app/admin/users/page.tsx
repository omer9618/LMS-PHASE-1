import type { Metadata } from 'next';
import { UsersScreen } from '@/components/admin/screens/UsersScreen';

export const metadata: Metadata = { title: 'Users and teachers' };

export default function UsersAndTeachersPage() {
  return <UsersScreen />;
}
