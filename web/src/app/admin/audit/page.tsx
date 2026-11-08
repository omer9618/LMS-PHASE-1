import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditScreen } from '@/components/admin/screens/AuditScreen';

export const metadata: Metadata = { title: 'Audit log' };

export default function AuditLogPage() {
  return (
    <Suspense fallback={null}>
      <AuditScreen />
    </Suspense>
  );
}
