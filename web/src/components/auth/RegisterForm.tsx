'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, ButtonLink, Button, Input } from '@/components/ui';
import styles from '@/components/forms/Form.module.css';
import { api } from '@/lib/api/client';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import { safeNextPath } from '@/lib/format';
import { registrationForm } from '@/lib/forms/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/forms/fields';
import { useSession } from '@/lib/session';
import { validateForm } from '@/lib/zod-form';
import { ignored } from '@/lib/api/schemas/common';

interface Values {
  fullName: string;
  email: string;
  password: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
}

const EMPTY: Values = {
  fullName: '',
  email: '',
  password: '',
  guardianName: '',
  guardianEmail: '',
  guardianPhone: '',
};

/** The checks worth doing before a round trip; the API has the final say. */
export function validateRegistration(values: Values): Record<string, string> {
  const result = validateForm(registrationForm, values);
  return result.ok ? {} : result.errors;
}

/** The request body: optional guardian fields are left out when empty (the API rejects ""). */
export function registrationBody(values: Values): Record<string, string> {
  const result = validateForm(registrationForm, values);
  if (!result.ok) throw new Error('registrationBody needs valid values');
  return result.data;
}

/** Student registration (#11). Guardian details are optional (decided 2026-10-26). */
export function RegisterForm() {
  const next = safeNextPath(useSearchParams().get('next'));
  const { refresh } = useSession();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const bind = (key: keyof Values) => ({
    name: key,
    value: values[key],
    onChange: (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
    error: errors[key],
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateRegistration(values);
    setErrors(invalid);
    setFormError(null);
    if (Object.keys(invalid).length > 0) return;

    setSubmitting(true);
    try {
      await api.post('/auth/register', ignored, registrationBody(values));
      setRegisteredEmail(values.email.trim());
      await refresh();
    } catch (error) {
      const byField = fieldErrors(error);
      setErrors(byField);
      setFormError(
        Object.keys(byField).length > 0
          ? 'Please correct the fields marked below.'
          : errorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (registeredEmail) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          <h1>Check your email</h1>
        </div>
        <Alert tone="success" title="Your account is ready">
          We sent a verification link to <strong>{registeredEmail}</strong>. Open it to confirm your
          email address. You are already signed in.
        </Alert>
        <ButtonLink href={next} fullWidth>
          Continue
        </ButtonLink>
      </div>
    );
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit} aria-labelledby="register-title">
      <div className={styles.header}>
        <p className="eyebrow">Students · free account</p>
        <h1 id="register-title">Create your account</h1>
        <p className={styles.intro}>
          For students. Teachers <Link href="/teach-with-us">apply here</Link> instead.
        </p>
      </div>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Input label="Full name" autoComplete="name" required {...bind('fullName')} />
      <Input label="Email" type="email" autoComplete="email" required {...bind('email')} />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`}
        required
        {...bind('password')}
      />
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Parent or guardian (optional)</legend>
        <Input label="Guardian’s name" autoComplete="off" {...bind('guardianName')} />
        <Input
          label="Guardian’s email"
          type="email"
          autoComplete="off"
          {...bind('guardianEmail')}
        />
        <Input
          label="Guardian’s phone"
          type="tel"
          autoComplete="off"
          hint="Include the country code, e.g. +92 300 1234567"
          {...bind('guardianPhone')}
        />
      </fieldset>
      <Button type="submit" fullWidth loading={submitting} loadingText="Creating account…">
        Create account
      </Button>
      <div className={styles.footer}>
        <p>
          Already have an account?{' '}
          <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
      </div>
    </form>
  );
}
