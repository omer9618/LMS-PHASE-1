'use client';

import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, ButtonLink, Checkbox, Input, SignInGate } from '@/components/ui';
import styles from '@/components/ui/Form.module.css';
import { authApi } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/errors';
import { useMutation } from '@/lib/use-mutation';
import { safeNextPath } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useQuery } from '@tanstack/react-query';
import mfa from './Mfa.module.css';
import * as authSchema from '@/lib/api/schemas/auth';
import { mfaCodeForm } from '@/lib/forms/auth';
import { validateForm } from '@/lib/forms/validate';

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP": easier to type into an authenticator app. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

type Setup = authSchema.MfaSetup;

/**
 * #16: TOTP enrolment. Start → scan the QR code (or type the key) → confirm a code → the
 * recovery codes are shown once. When MFA is already on, recovery codes can be replaced.
 */
export function MfaSetup() {
  const next = safeNextPath(useSearchParams().get('next'), '/courses');
  const { status: sessionStatus, user, refresh } = useSession();
  const mfaStatus = useQuery({
    queryKey: ['mfa', user?.id],
    queryFn: ({ signal }) => authApi.mfaStatus(signal),
    enabled: user !== null,
  });
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const starting = useMutation();

  if (sessionStatus === 'loading') return <p role="status">Loading…</p>;
  if (!user) {
    return (
      <SignInGate next="/account/mfa" title="Sign in to set up two-step verification">
        Two-step verification protects your account with a code from an authenticator app.
      </SignInGate>
    );
  }

  if (recoveryCodes) {
    return <RecoveryCodes codes={recoveryCodes} next={next} />;
  }

  if (mfaStatus.status === 'pending') return <p role="status">Loading…</p>;
  if (mfaStatus.status === 'error') {
    return <Alert tone="danger">{errorMessage(mfaStatus.error)}</Alert>;
  }

  if (mfaStatus.data.enabled) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          <h1>Two-step verification</h1>
        </div>
        <Alert tone="success" title="Two-step verification is on">
          You have {mfaStatus.data.recoveryCodesRemaining} unused recovery{' '}
          {mfaStatus.data.recoveryCodesRemaining === 1 ? 'code' : 'codes'}.
        </Alert>
        <CodeForm
          title="Replace your recovery codes"
          intro="The old codes stop working. Enter a code from your authenticator app to continue."
          submitLabel="Create new recovery codes"
          onCode={async (code) => {
            const result = await authApi.newRecoveryCodes(code);
            setRecoveryCodes(result.recoveryCodes);
          }}
        />
      </div>
    );
  }

  const start = () => starting.run(async () => setSetup(await authApi.mfaSetup()));

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <h1>Set up two-step verification</h1>
        <p className={styles.intro}>
          {mfaStatus.data.required
            ? 'Admin accounts must use two-step verification. You need an authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password.'
            : 'Protect your account with a code from an authenticator app.'}
        </p>
      </div>
      {!setup ? (
        <>
          {starting.error && <Alert tone="danger">{starting.error}</Alert>}
          <Button
            onClick={() => void start()}
            loading={starting.pending}
            loadingText="Starting…"
            fullWidth
          >
            Start set-up
          </Button>
        </>
      ) : (
        <>
          <SetupKey setup={setup} />
          <CodeForm
            title="Confirm"
            intro="Enter the 6-digit code your app now shows."
            submitLabel="Turn on two-step verification"
            onCode={async (code) => {
              const result = await authApi.mfaEnable(code);
              setRecoveryCodes(result.recoveryCodes);
              await refresh();
            }}
          />
        </>
      )}
    </div>
  );
}

function SetupKey({ setup }: { setup: Setup }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 200 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [setup.otpauthUri]);

  return (
    <section className={mfa.setupKey} aria-labelledby="scan-heading">
      <h2 id="scan-heading" className={mfa.stepTitle}>
        Add this account to your app
      </h2>
      {qr && (
        // A data: URL generated in the browser; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code for your authenticator app" width={200} height={200} />
      )}
      <p>
        Can’t scan? Enter this key in the app (time-based):{' '}
        <code className={mfa.secret}>{groupSecret(setup.secret)}</code>
      </p>
      <p>
        <a href={setup.otpauthUri}>Open in an authenticator app on this device</a>
      </p>
    </section>
  );
}

function CodeForm({
  title,
  intro,
  submitLabel,
  onCode,
}: {
  title: string;
  intro: string;
  submitLabel: string;
  onCode: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | undefined>();
  const verify = useMutation();
  const error = localError ?? verify.error ?? undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(mfaCodeForm(false), { code });
    if (!checked.ok) {
      setLocalError(checked.errors.code);
      return;
    }
    setLocalError(undefined);
    await verify.run(() => onCode(code.trim()));
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit} aria-label={title}>
      <h2 className={mfa.stepTitle}>{title}</h2>
      <p className="muted">{intro}</p>
      <Input
        label="Authentication code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
      />
      <Button type="submit" loading={verify.pending} loadingText="Checking…" fullWidth>
        {submitLabel}
      </Button>
    </form>
  );
}

/** Shown exactly once: the API stores only hashes. */
export function RecoveryCodes({ codes, next }: { codes: string[]; next: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <h1>Save your recovery codes</h1>
      </div>
      <Alert tone="warning" title="You will not see these codes again">
        Each code signs you in once if you lose your phone. Keep them somewhere safe, such as a
        password manager.
      </Alert>
      <ol className={mfa.codes} aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>
      <div className={mfa.actions}>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <a
          className={mfa.download}
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${text}\n`)}`}
          download="lms-recovery-codes.txt"
        >
          Download as a text file
        </a>
      </div>
      <Checkbox
        label="I have saved my recovery codes"
        checked={saved}
        onChange={(e) => setSaved(e.target.checked)}
      />
      {saved ? (
        <ButtonLink href={next} fullWidth>
          Continue
        </ButtonLink>
      ) : (
        <Button fullWidth disabled>
          Continue
        </Button>
      )}
    </div>
  );
}
