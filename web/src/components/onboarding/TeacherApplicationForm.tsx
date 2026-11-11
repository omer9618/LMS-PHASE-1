'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Captcha } from '@/components/forms/Captcha';
import { Alert, Button, Input, Textarea } from '@/components/ui/index';
import styles from '@/components/forms/Form.module.css';
import { api } from '@/lib/api/client';
import { isRequestError } from '@/lib/api/errors';
import { applicationFormData, teacherApplicationForm } from '@/lib/forms/apply';
import { CV_ACCEPT, CV_MAX_BYTES } from '@/lib/forms/fields';
import { formatBytes } from '@/lib/format';
import { useMutation } from '@/lib/use-mutation';
import { validateForm } from '@/lib/zod-form';
import * as authSchema from '@/lib/api/schemas/auth';

export { CV_ACCEPT, CV_MAX_BYTES } from '@/lib/forms/fields';

/** Checks the chosen CV before uploading; the API checks the real content again. */
export function checkCv(file: File | null): string | undefined {
  const result = validateForm(cvOnly, { cv: file });
  return result.ok ? undefined : result.errors.cv;
}

const cvOnly = teacherApplicationForm.pick({ cv: true });

interface Values {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  subjects: string;
}

/** #18: the public "teach with us" application, with a CV (#19) and a human check. */
export function TeacherApplicationForm() {
  const [values, setValues] = useState<Values>({
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    subjects: '',
  });
  const [cv, setCv] = useState<File | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const send = useMutation();
  const shown = { ...errors, ...send.fieldErrors };
  const serverMessage = isRequestError(send.failure, 'CAPTCHA_FAILED')
    ? 'The human check failed. Please try it again.'
    : isRequestError(send.failure, 'UPLOAD_REJECTED')
      ? `Your CV was not accepted: ${send.error}`
      : send.error;
  const [submitted, setSubmitted] = useState<string | null>(null);
  // Remounts the captcha after a failed attempt, since its token is single-use.
  const [captchaKey, setCaptchaKey] = useState(0);

  const bind = (key: keyof Values) => ({
    name: key,
    value: values[key],
    onChange: (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
    error: shown[key],
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateForm(teacherApplicationForm, { ...values, cv });
    setErrors(checked.ok ? {} : checked.errors);
    setFormError(null);
    if (!checked.ok) return;
    if (!captchaToken) {
      setFormError('Please complete the human check.');
      return;
    }

    const form = applicationFormData(checked.data, captchaToken);

    await send.run(
      async () => {
        await api.postForm('/teacher-applications', authSchema.submittedApplication, form);
        setSubmitted(values.applicantEmail.trim());
      },
      undefined,
      () => {
        // A human-check token works once: ask for a fresh one.
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      },
    );
  }

  if (submitted) {
    return (
      <div className={styles.form}>
        <div className={styles.header}>
          <h1>Application received</h1>
        </div>
        <Alert tone="success" title="Thank you for applying">
          We will review your application and contact you at <strong>{submitted}</strong>.
        </Alert>
        <p>
          <Link href="/courses">Browse courses</Link>
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit} aria-labelledby="apply-title">
      <div className={styles.header}>
        <p className="eyebrow">For teachers</p>
        <h1 id="apply-title">Teach with us</h1>
        <p className={styles.intro}>
          Tell us about yourself and attach your CV. An administrator reviews every application and
          creates your teacher account if it is accepted.
        </p>
      </div>
      {(formError ?? serverMessage) && <Alert tone="danger">{formError ?? serverMessage}</Alert>}
      <Input label="Full name" autoComplete="name" required {...bind('applicantName')} />
      <Input label="Email" type="email" autoComplete="email" required {...bind('applicantEmail')} />
      <Input
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        hint="Include the country code, e.g. +92 300 1234567"
        {...bind('applicantPhone')}
      />
      <Textarea
        label="Subjects and levels you teach (optional)"
        hint="For example: A Level Physics (Cambridge), IGCSE Maths (Edexcel)"
        maxLength={500}
        {...bind('subjects')}
      />
      <Input
        label="CV"
        type="file"
        name="cv"
        accept={CV_ACCEPT}
        hint={`PDF or Word, at most ${formatBytes(CV_MAX_BYTES)}.`}
        required
        error={shown.cv}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setCv(file);
          setErrors((current) => {
            const { cv: _old, ...rest } = current;
            const problem = file ? checkCv(file) : undefined;
            return problem ? { ...rest, cv: problem } : rest;
          });
        }}
      />
      <Captcha key={captchaKey} onToken={setCaptchaToken} />
      <Button type="submit" fullWidth loading={send.pending} loadingText="Sending application…">
        Send application
      </Button>
    </form>
  );
}
