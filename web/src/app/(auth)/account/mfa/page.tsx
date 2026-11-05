import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MfaSetup } from '@/components/account/MfaSetup';

export const metadata: Metadata = { title: 'Two-step verification' };

export default function MfaPage() {
  // Reads ?next= (useSearchParams), so it renders on the client.
  return (
    <Suspense>
      <MfaSetup />
    </Suspense>
  );
}
