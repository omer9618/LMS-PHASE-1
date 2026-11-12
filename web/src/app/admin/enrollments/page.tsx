import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EnrollmentsScreen } from '@/components/admin/screens/EnrollmentsScreen';

export const metadata: Metadata = { title: 'Enrolments' };

export default function EnrollmentsPage() {
  return (
    <Suspense fallback={null}>
      <EnrollmentsScreen />
    </Suspense>
  );
}
