'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, ButtonLink } from '@/components/ui';
import styles from '@/components/ui/Form.module.css';
import { api } from '@/lib/api/client';
import { errorMessage, isRequestError } from '@/lib/api/errors';
import { useSession } from '@/lib/session';
import { ResendVerificationButton } from './ResendVerificationButton';
import { ignored } from '@/lib/api/schemas/common';

type State =
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'invalid' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

/** #11: opened from the link in the verification email (`/verify-email?token=...`). */
export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const { status, refresh } = useSession();
  const [state, setState] = useState<State>(token ? { kind: 'verifying' } : { kind: 'missing' });
  // A token is single-use: never send it twice (React strict mode runs effects twice in dev).
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!token || sent.current === token) return;
    sent.current = token;
    api
      .post('/auth/verify-email', ignored, { token })
      .then(async () => {
        setState({ kind: 'verified' });
        await refresh();
      })
      .catch((error: unknown) => {
        if (isRequestError(error, 'INVALID_TOKEN') || isRequestError(error, 'VALIDATION_FAILED')) {
          setState({ kind: 'invalid' });
        } else {
          setState({ kind: 'error', message: errorMessage(error) });
        }
      });
  }, [token, refresh]);

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <h1>Verify your email</h1>
      </div>
      {state.kind === 'verifying' && <Alert tone="info" title="Checking your link…" />}
      {state.kind === 'verified' && (
        <>
          <Alert tone="success" title="Email verified">
            Thank you. Your email address is confirmed.
          </Alert>
          <ButtonLink href="/courses" fullWidth>
            Browse courses
          </ButtonLink>
        </>
      )}
      {state.kind === 'missing' && (
        <>
          <Alert tone="info" title="Open the link from your email">
            We emailed you a link to confirm your address. Open that link: this page does not work
            without it.
          </Alert>
          {status === 'signed-in' ? (
            <ResendVerificationButton />
          ) : (
            <p>
              <Link href="/login?next=/verify-email" className={styles.standaloneLink}>
                Sign in
              </Link>{' '}
              to send yourself a new link.
            </p>
          )}
        </>
      )}
      {state.kind === 'invalid' && (
        <>
          <Alert tone="danger" title="This link is invalid or has expired">
            Verification links work once and expire after 48 hours.
          </Alert>
          {status === 'signed-in' ? (
            <ResendVerificationButton />
          ) : (
            <p>
              <Link href="/login?next=/verify-email" className={styles.standaloneLink}>
                Sign in
              </Link>{' '}
              to send yourself a new link.
            </p>
          )}
        </>
      )}
      {state.kind === 'error' && <Alert tone="danger">{state.message}</Alert>}
    </div>
  );
}
