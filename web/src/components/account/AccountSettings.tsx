'use client';

import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Input,
  Loadable,
  MutationStatus,
  PageHeader,
  Section,
  SignInGate,
  Skeleton,
} from '@/components/ui';
import { authApi } from '@/lib/api/auth';
import { describeDevice } from '@/lib/device';
import { formatDateTime } from '@/lib/format';
import { accountNameForm, changePasswordForm } from '@/lib/forms/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/forms/fields';
import { validateForm } from '@/lib/forms/validate';
import { useSession } from '@/lib/session';
import { useMutation } from '@/lib/use-mutation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './Account.module.css';

/**
 * The signed-in person's own account: name, password, and the devices they are signed in on.
 * Email is shown but not editable here: it is the sign-in name and where resets are sent.
 */
export function AccountSettings() {
  const { status, user } = useSession();

  if (status === 'loading') return <Skeleton label="Loading…" />;
  if (!user) {
    return (
      <div className="page">
        <SignInGate next="/account">Sign in to manage your account.</SignInGate>
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageHeader
        eyebrow="Settings"
        title="Your account"
        description="Your name, your password, and where you are signed in."
      />
      <NameSection />
      <PasswordSection />
      <DevicesSection />
      <Section title="Two-step verification">
        <p>
          A code from an authenticator app, asked for after your password. Required for admin
          accounts.
        </p>
        <p>
          <ButtonLink href="/account/mfa" variant="secondary" size="sm">
            Manage two-step verification
          </ButtonLink>
        </p>
      </Section>
    </div>
  );
}

function NameSection() {
  const { user, refresh } = useSession();
  const [name, setName] = useState(user?.fullName ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation();
  const shown = { ...errors, ...save.fieldErrors };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(accountNameForm, { fullName: name });
    setErrors(checked.ok ? {} : checked.errors);
    if (!checked.ok) return;
    await save.run(async () => {
      await authApi.updateName(checked.data.fullName);
      await refresh();
    }, 'Name saved.');
  }

  return (
    <Section title="Name and email">
      <form className={styles.form} noValidate onSubmit={submit} aria-label="Name">
        <Input
          label="Full name"
          name="fullName"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={shown.fullName}
          required
        />
        <Input
          label="Email"
          name="email"
          value={user?.email ?? ''}
          readOnly
          hint="This is the address you sign in with and where password resets go."
        />
        <MutationStatus mutation={save} />
        <div>
          <Button type="submit" loading={save.pending} loadingText="Saving…">
            Save name
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<number | null>(null);
  const change = useMutation();
  const queryClient = useQueryClient();
  const shown = { ...errors, ...change.fieldErrors };
  const bind = (key: keyof typeof values) => ({
    name: key,
    value: values[key],
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setDone(null);
    },
    error: shown[key],
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(changePasswordForm, values);
    setErrors(checked.ok ? {} : checked.errors);
    setDone(null);
    if (!checked.ok) return;
    await change.run(async () => {
      const result = await authApi.changePassword({
        currentPassword: checked.data.currentPassword,
        newPassword: checked.data.newPassword,
      });
      setValues({ currentPassword: '', newPassword: '', confirm: '' });
      setDone(result.otherSessionsEnded);
      void queryClient.invalidateQueries({ queryKey: ['account-sessions'] });
    });
  }

  return (
    <Section title="Password">
      <form className={styles.form} noValidate onSubmit={submit} aria-label="Change password">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          {...bind('currentPassword')}
          required
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`}
          {...bind('newPassword')}
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          {...bind('confirm')}
          required
        />
        {change.error && <Alert tone="danger">{change.error}</Alert>}
        {done !== null && (
          <Alert tone="success">
            Your password was changed.{' '}
            {done > 0
              ? `${done} other ${done === 1 ? 'device was' : 'devices were'} signed out.`
              : 'You were not signed in anywhere else.'}
          </Alert>
        )}
        <div>
          <Button type="submit" loading={change.pending} loadingText="Changing…">
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** Devices listed before "Show more": the current one first, then the most recently active. */
const DEVICES_SHOWN = 5;
/** A loopback address says nothing to the person (it is how a development machine sees itself). */
const isLoopback = (ip: string) =>
  ip === '::1' || ip.startsWith('127.') || ip === '::ffff:127.0.0.1';

function DevicesSection() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: ({ signal }) => authApi.sessions(signal),
  });
  const action = useMutation();
  const [shown, setShown] = useState(DEVICES_SHOWN);
  const reload = () => queryClient.invalidateQueries({ queryKey: ['account-sessions'] });

  return (
    <Section title="Where you are signed in">
      <Loadable state={sessions} what="your devices">
        {(devices) => {
          const others = devices.filter((d) => !d.current);
          const ordered = [...devices].sort(
            (a, b) =>
              Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt),
          );
          return (
            <>
              <ul className={styles.devices}>
                {ordered.slice(0, shown).map((device) => (
                  <li key={device.id} className={styles.device}>
                    <div className={styles.deviceText}>
                      <span className={styles.deviceName}>
                        {describeDevice(device.userAgent)}{' '}
                        {device.current && <Badge tone="primary">This device</Badge>}
                      </span>
                      <span className="muted">
                        Last active {formatDateTime(device.lastSeenAt)}
                        {device.ipAddress && !isLoopback(device.ipAddress)
                          ? ` · ${device.ipAddress}`
                          : ''}
                      </span>
                    </div>
                    {!device.current && (
                      <Button
                        variant="secondary"
                        loading={action.pending}
                        aria-label={`Sign out ${describeDevice(device.userAgent)}, last active ${formatDateTime(device.lastSeenAt)}`}
                        onClick={async () => {
                          if (
                            await action.run(() => authApi.signOutDevice(device.id), 'Signed out.')
                          ) {
                            void reload();
                          }
                        }}
                      >
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {ordered.length > shown && (
                <div>
                  <Button variant="ghost" onClick={() => setShown((n) => n + DEVICES_SHOWN)}>
                    Show {Math.min(DEVICES_SHOWN, ordered.length - shown)} more
                  </Button>
                </div>
              )}
              <MutationStatus mutation={action} />
              {others.length > 0 && (
                <div>
                  <Button
                    variant="secondary"
                    loading={action.pending}
                    onClick={async () => {
                      if (
                        await action.run(
                          () => authApi.signOutOtherDevices(),
                          'Signed out of every other device.',
                        )
                      ) {
                        void reload();
                      }
                    }}
                  >
                    Sign out all other devices
                  </Button>
                </div>
              )}
            </>
          );
        }}
      </Loadable>
    </Section>
  );
}
