import type { Metadata } from 'next';
import { DashboardScreen } from '@/components/admin/screens/DashboardScreen';

export const metadata: Metadata = { title: 'Admin dashboard' };

export default function AdminDashboardPage() {
  return <DashboardScreen />;
}
