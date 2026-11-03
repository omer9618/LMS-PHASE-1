import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  // The form reads the query string (useSearchParams), so it renders on the client.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
