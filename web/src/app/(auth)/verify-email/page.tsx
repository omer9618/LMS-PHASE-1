import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/components/auth/VerifyEmail';

export const metadata: Metadata = { title: 'Verify your email' };

export default function VerifyEmailPage() {
  // Reads ?token= (useSearchParams), so it renders on the client.
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
