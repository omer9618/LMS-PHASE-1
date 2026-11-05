import type { Metadata } from 'next';
import { StudentDashboard } from '@/components/dashboard/StudentDashboard';

export const metadata: Metadata = { title: 'My learning' };

export default function DashboardPage() {
  return (
    <div className="page">
      <StudentDashboard />
    </div>
  );
}
