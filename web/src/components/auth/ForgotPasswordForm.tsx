'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import styles from '@/components/ui/Form.module.css';
import { authApi } from '@/lib/api/auth';
import { forgotPasswordForm } from '@/lib/forms/auth';
import { useMutation } from '@/lib/use-mutation';
import { validateForm } from '@/lib/forms/validate';

/** #13: request a reset link. The answer never reveals whether the account exists. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const request = useMutation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(forgotPasswordForm, { email });
    if (!checked.ok) {
      setError(checked.errors.email);
      return;
    }
    const value = checked.data.email;
    setError(undefined);
    const ok = await request.run(() => authApi.requestPasswordReset(value));
    if (ok) setSentTo(value);
  }

  useEffect(() => {
    if (sentTo) sentHeading.current?.focus();
  }, [sentTo]);

  if (sentTo) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          {/* Focus lands here when the form is replaced, so the change is announced. */}
          <h1 ref={sentHeading} tabIndex={-1}>
            Check your email
          </h1>
        </div>
        <Alert tone="success">
          If an account exists for <strong>{sentTo}</strong>, we have sent it a link to reset the
          password. The link expires soon, so use it shortly.
        </Alert>
        <p>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit} aria-labelledby="forgot-title">
      <div className={styles.header}>
        <p className="eyebrow">Account recovery</p>
        <h1 id="forgot-title">Reset your password</h1>
        <p className={styles.intro}>
          Enter your email and we will send you a link to set a new one.
        </p>
      </div>
      {request.error && <Alert tone="danger">{request.error}</Alert>}
      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error ?? request.fieldErrors.email}
        required
      />
      <Button type="submit" fullWidth loading={request.pending} loadingText="Sending…">
        Send reset link
      </Button>
      <div className={styles.footer}>
        <Link href="/login">Back to sign in</Link>
      </div>
    </form>
  );
}
