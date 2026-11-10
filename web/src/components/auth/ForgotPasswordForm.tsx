'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import styles from '@/components/forms/Form.module.css';
import { authApi } from '@/lib/api/auth';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import { forgotPasswordForm } from '@/lib/forms/auth';
import { validateForm } from '@/lib/zod-form';

/** #13: request a reset link. The answer never reveals whether the account exists. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const checked = validateForm(forgotPasswordForm, { email });
    if (!checked.ok) {
      setError(checked.errors.email);
      return;
    }
    const value = checked.data.email;
    setError(undefined);
    setSubmitting(true);
    try {
      await authApi.requestPasswordReset(value);
      setSentTo(value);
    } catch (err) {
      setError(fieldErrors(err).email);
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          <h1>Check your email</h1>
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
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        required
      />
      <Button type="submit" fullWidth loading={submitting} loadingText="Sending…">
        Send reset link
      </Button>
      <div className={styles.footer}>
        <Link href="/login">Back to sign in</Link>
      </div>
    </form>
  );
}
