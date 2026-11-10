'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import styles from '@/components/forms/Form.module.css';
import { api } from '@/lib/api/client';
import { errorMessage, fieldErrors, isApiError } from '@/lib/api/errors';
import { safeNextPath } from '@/lib/format';
import { needsMfaSetup, useSession } from '@/lib/session';
import * as authSchema from '@/lib/api/schemas/auth';
import { loginForm, mfaCodeForm } from '@/lib/forms/auth';
import { validateForm } from '@/lib/zod-form';
import { ignored } from '@/lib/api/schemas/common';

type Step = { kind: 'password' } | { kind: 'mfa'; challengeToken: string };

/**
 * Sign in (#12), with the second step for MFA accounts (#16): a correct password for an admin
 * returns `{ mfaRequired, challengeToken }`, then POST /auth/login/mfa with the 6-digit code or a
 * recovery code.
 */
export function LoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const { refresh } = useSession();

  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function finish() {
    const me = await refresh();
    // An admin who has not enrolled MFA can do nothing else until they do (#16).
    router.replace(needsMfaSetup(me) ? `/account/mfa?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(loginForm, { email, password });
    setErrors(checked.ok ? {} : checked.errors);
    setFormError(null);
    setNotice(null);
    if (!checked.ok) return;

    setSubmitting(true);
    try {
      const result = await api.post('/auth/login', authSchema.loginResult, checked.data);
      if (result.mfaRequired) {
        setStep({ kind: 'mfa', challengeToken: result.challengeToken });
        setPassword('');
      } else {
        await finish();
      }
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(event: FormEvent, challengeToken: string) {
    event.preventDefault();
    const value = code.trim();
    setFormError(null);
    const checked = validateForm(mfaCodeForm(useRecovery), { code: value });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/auth/login/mfa', ignored, {
        challengeToken,
        ...(useRecovery ? { recoveryCode: value } : { code: value }),
      });
      await finish();
    } catch (error) {
      if (isApiError(error, 'INVALID_TOKEN')) {
        // The challenge lasts 5 minutes: start again from the password.
        setStep({ kind: 'password' });
        setCode('');
        setNotice('That sign-in attempt expired. Enter your password again.');
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (step.kind === 'mfa') {
    return (
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => void submitCode(e, step.challengeToken)}
        aria-labelledby="mfa-title"
      >
        <div className={styles.header}>
          <h1 id="mfa-title">Two-step verification</h1>
          <p className={styles.intro}>
            {useRecovery
              ? 'Enter one of the recovery codes you saved when you set up two-step verification.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input
          key={useRecovery ? 'recovery' : 'totp'}
          label={useRecovery ? 'Recovery code' : 'Authentication code'}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={errors.code ?? errors.recoveryCode}
          autoComplete="one-time-code"
          inputMode={useRecovery ? 'text' : 'numeric'}
          maxLength={useRecovery ? 20 : 6}
          autoFocus
          required
        />
        <Button type="submit" fullWidth loading={submitting} loadingText="Verifying…">
          Verify and sign in
        </Button>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode('');
              setErrors({});
            }}
          >
            {useRecovery ? 'Use the authenticator app instead' : 'Use a recovery code instead'}
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setStep({ kind: 'password' });
              setCode('');
              setErrors({});
              setFormError(null);
            }}
          >
            Back to sign in
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={submitPassword}
      aria-labelledby="login-title"
    >
      <div className={styles.header}>
        <h1 id="login-title">Sign in</h1>
      </div>
      {notice && <Alert tone="warning">{notice}</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        required
      />
      <Input
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        required
      />
      <Button type="submit" fullWidth loading={submitting} loadingText="Signing in…">
        Sign in
      </Button>
      <div className={styles.footer}>
        <Link href="/forgot-password">Forgot your password?</Link>
        <p>
          New here?{' '}
          <Link href={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
        </p>
      </div>
    </form>
  );
}
