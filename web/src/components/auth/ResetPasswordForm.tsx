'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, ButtonLink, Input } from '@/components/ui';
import styles from '@/components/forms/Form.module.css';
import { api } from '@/lib/api/client';
import { errorMessage, fieldErrors, isApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session';
import { resetPasswordForm } from '@/lib/forms/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/forms/fields';
import { validateForm } from '@/lib/zod-form';

/**
 * #13 password reset, and #15 first password for staff accounts an admin created: the welcome
 * email links here with `welcome=1`, which only changes the wording.
 */
export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token');
  const welcome = params.get('welcome') === '1';
  const { refresh } = useSession();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(!token);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const title = welcome ? 'Set your password' : 'Choose a new password';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(resetPasswordForm, { password, confirm });
    setErrors(checked.ok ? {} : checked.errors);
    setFormError(null);
    if (!checked.ok || !token) return;

    setSubmitting(true);
    try {
      await api.post('/auth/password-reset/confirm', { token, password });
      setDone(true);
      // A reset signs the account out everywhere, including here.
      await refresh();
    } catch (error) {
      if (isApiError(error, 'INVALID_TOKEN')) {
        setInvalidLink(true);
      } else {
        setErrors(fieldErrors(error));
        setFormError(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (invalidLink) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          <h1>{title}</h1>
        </div>
        <Alert tone="danger" title="This link is invalid or has expired">
          {welcome
            ? 'Ask an administrator to send you a new invitation, or request a reset link below.'
            : 'Reset links work once and expire after a while.'}
        </Alert>
        <p>
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          <h1>{welcome ? 'Your password is set' : 'Password changed'}</h1>
        </div>
        <Alert tone="success">
          {welcome
            ? 'Your account is ready. Sign in with your email and new password.'
            : 'Your password has been changed and you have been signed out everywhere. Sign in with the new password.'}
        </Alert>
        <ButtonLink href="/login" fullWidth>
          Sign in
        </ButtonLink>
      </div>
    );
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit} aria-labelledby="reset-title">
      <div className={styles.header}>
        <h1 id="reset-title">{title}</h1>
        {welcome && (
          <p className={styles.intro}>
            Welcome. An administrator created your account; choose a password to finish setting it
            up.
          </p>
        )}
      </div>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Input
        label="New password"
        type="password"
        name="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        required
      />
      <Input
        label="Confirm new password"
        type="password"
        name="confirm"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        required
      />
      <Button type="submit" fullWidth loading={submitting} loadingText="Saving…">
        {welcome ? 'Set password' : 'Change password'}
      </Button>
    </form>
  );
}
