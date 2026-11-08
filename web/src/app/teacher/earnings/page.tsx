import type { Metadata } from 'next';
import { Earnings } from '@/components/teacher/Earnings';

export const metadata: Metadata = { title: 'Earnings' };

export default function TeacherEarningsPage() {
  return <Earnings />;
}
