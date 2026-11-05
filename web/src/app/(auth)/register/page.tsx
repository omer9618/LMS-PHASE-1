import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  // The form reads the query string (useSearchParams), so it renders on the client.
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
