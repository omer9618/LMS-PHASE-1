'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import styles from '@/components/ui/Form.module.css';
import { authApi } from '@/lib/api/auth';
import { isRequestError } from '@/lib/api/errors';
import { safeNextPath } from '@/lib/format';
import { homePathFor } from '@/lib/home-path';
import { needsMfaSetup, useSession } from '@/lib/session';
import { loginForm, mfaCodeForm } from '@/lib/forms/auth';
import { useMutation } from '@/lib/use-mutation';
import { validateForm } from '@/lib/forms/validate';

type Step = { kind: 'password' } | { kind: 'mfa'; challengeToken: string };

/**
 * Sign in (#12), with the second step for MFA accounts (#16): a correct password for an admin
 * returns `{ mfaRequired, challengeToken }`, then POST /auth/login/mfa with the 6-digit code or a
 * recovery code.
 */
export function LoginForm() {
  const router = useRouter();
  // A page that asked for sign-in comes first; otherwise staff land in their own area.
  const requestedNext = safeNextPath(useSearchParams().get('next'), '');
  const { refresh } = useSession();

  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const signIn = useMutation();
  const shown = { ...errors, ...signIn.fieldErrors };

  async function finish() {
    const me = await refresh();
    const next = requestedNext || homePathFor(me);
    // An admin who has not enrolled MFA can do nothing else until they do (#16).
    router.replace(needsMfaSetup(me) ? `/account/mfa?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(loginForm, { email, password });
    setErrors(checked.ok ? {} : checked.errors);
    setNotice(null);
    if (!checked.ok) return;

    await signIn.run(async () => {
      const result = await authApi.login(checked.data);
      if (result.mfaRequired) {
        setStep({ kind: 'mfa', challengeToken: result.challengeToken });
        setPassword('');
      } else {
        await finish();
      }
    });
  }

  async function submitCode(event: FormEvent, challengeToken: string) {
    event.preventDefault();
    const value = code.trim();
    const checked = validateForm(mfaCodeForm(useRecovery), { code: value });
    setErrors(checked.ok ? {} : checked.errors);
    if (!checked.ok) return;

    await signIn.run(
      async () => {
        await authApi.loginWithMfa({
          challengeToken,
          ...(useRecovery ? { recoveryCode: value } : { code: value }),
        });
        await finish();
      },
      undefined,
      (error) => {
        if (!isRequestError(error, 'INVALID_TOKEN')) return;
        // The challenge lasts 5 minutes: start again from the password.
        setStep({ kind: 'password' });
        setCode('');
        setNotice('That sign-in attempt expired. Enter your password again.');
        return true;
      },
    );
  }

  if (step.kind === 'mfa') {
    return (
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => void submitCode(e, step.challengeToken)}
        aria-labelledby="mfa-title"
      >
        <div className={styles.stepBar}>
          <span>2 · Two-step verification</span>
          <span className={styles.stepTag}>Admin</span>
        </div>
        <div className={styles.header}>
          <h1 id="mfa-title">Two-step verification</h1>
          <p className={styles.intro}>
            {useRecovery
              ? 'Enter one of the recovery codes you saved when you set up two-step verification.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>
        {signIn.error && <Alert tone="danger">{signIn.error}</Alert>}
        <Input
          key={useRecovery ? 'recovery' : 'totp'}
          label={useRecovery ? 'Recovery code' : 'Authentication code'}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={shown.code ?? shown.recoveryCode}
          autoComplete="one-time-code"
          inputMode={useRecovery ? 'text' : 'numeric'}
          maxLength={useRecovery ? 20 : 6}
          autoFocus
          required
        />
        <Button type="submit" fullWidth loading={signIn.pending} loadingText="Verifying…">
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
              signIn.clear();
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
        <p className="eyebrow">Step 1 for everyone · step 2 for admins</p>
        <h1 id="login-title">Sign in</h1>
      </div>
      {notice && <Alert tone="warning">{notice}</Alert>}
      {signIn.error && <Alert tone="danger">{signIn.error}</Alert>}
      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={shown.email}
        required
      />
      <Input
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={shown.password}
        required
      />
      <Button type="submit" fullWidth loading={signIn.pending} loadingText="Signing in…">
        Sign in
      </Button>
      <div className={styles.footer}>
        <Link href="/forgot-password">Forgot your password?</Link>
        <p>
          New here?{' '}
          <Link
            href={
              requestedNext ? `/register?next=${encodeURIComponent(requestedNext)}` : '/register'
            }
          >
            Create an account
          </Link>
        </p>
      </div>
    </form>
  );
}
