import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage() {
  // Reads ?token= and ?welcome=1 (useSearchParams), so it renders on the client.
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
