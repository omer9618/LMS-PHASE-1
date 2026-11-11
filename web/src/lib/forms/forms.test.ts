import { describe, expect, it } from 'vitest';
import { validateForm } from '@/lib/forms/validate';
import { teacherApplicationForm } from './apply';
import {
  forgotPasswordForm,
  loginForm,
  mfaCodeForm,
  registrationForm,
  resetPasswordForm,
} from './auth';
import { courseDetailsForm } from './course';
import { proofForm } from './orders';
import { profileForm } from './profile';

const pdf = (name = 'cv.pdf', size = 1000) => new File([new Uint8Array(size)], name);

describe('auth forms', () => {
  it('login needs both boxes and trims the email', () => {
    expect(validateForm(loginForm, { email: ' ', password: '' })).toEqual({
      ok: false,
      errors: { email: 'Enter your email address', password: 'Enter your password' },
    });
    expect(validateForm(loginForm, { email: ' a@b.co ', password: 'x' })).toEqual({
      ok: true,
      data: { email: 'a@b.co', password: 'x' },
    });
  });

  it('the sign-in code is 6 digits, or a long recovery code', () => {
    expect(validateForm(mfaCodeForm(false), { code: '12345' }).ok).toBe(false);
    expect(validateForm(mfaCodeForm(false), { code: ' 123456 ' }).ok).toBe(true);
    expect(validateForm(mfaCodeForm(true), { code: 'short' }).ok).toBe(false);
    expect(validateForm(mfaCodeForm(true), { code: 'abcde-fghij' }).ok).toBe(true);
  });

  it('registration leaves empty optional guardian fields out of the body', () => {
    const result = validateForm(registrationForm, {
      fullName: ' Ayesha Khan ',
      email: 'ayesha@example.com',
      password: 'correct horse battery',
      guardianName: '',
      guardianEmail: '',
      guardianPhone: ' 0300 ',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        fullName: 'Ayesha Khan',
        email: 'ayesha@example.com',
        password: 'correct horse battery',
        guardianPhone: '0300',
      },
    });
  });

  it('registration names every bad field', () => {
    const result = validateForm(registrationForm, {
      fullName: 'A',
      email: 'nope',
      password: 'short',
      guardianName: 'B',
      guardianEmail: 'x',
      guardianPhone: '',
    });
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      'email',
      'fullName',
      'guardianEmail',
      'guardianName',
      'password',
    ]);
  });

  it('password reset needs matching passwords', () => {
    expect(
      validateForm(resetPasswordForm, { password: 'long enough pw', confirm: 'other' }),
    ).toEqual({
      ok: false,
      errors: { confirm: 'The passwords do not match' },
    });
    expect(validateForm(forgotPasswordForm, { email: 'bad' }).ok).toBe(false);
  });
});

describe('teacher application form', () => {
  const values = {
    applicantName: 'Sana Iqbal',
    applicantEmail: 's@example.com',
    applicantPhone: '',
    subjects: '',
  };

  it('needs a CV that is a PDF or Word file within 5 MB', () => {
    expect(validateForm(teacherApplicationForm, { ...values, cv: null })).toMatchObject({
      ok: false,
      errors: { cv: 'Attach your CV' },
    });
    expect(validateForm(teacherApplicationForm, { ...values, cv: pdf('cv.png') }).ok).toBe(false);
    expect(
      validateForm(teacherApplicationForm, { ...values, cv: pdf('cv.pdf', 5 * 1024 * 1024 + 1) })
        .ok,
    ).toBe(false);
    expect(validateForm(teacherApplicationForm, { ...values, cv: pdf() }).ok).toBe(true);
  });
});

describe('course details form', () => {
  it('asks for the classification and a title', () => {
    const result = validateForm(courseDetailsForm, {
      boardId: '',
      levelId: '',
      subjectId: '',
      title: ' ',
      syllabusArea: '',
      description: '',
      progressionMode: 'FREE',
    });
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      'boardId',
      'levelId',
      'subjectId',
      'title',
    ]);
  });
});

describe('proof form', () => {
  it('turns the amount into exact minor units for the order currency', () => {
    const pkr = proofForm('PKR');
    expect(validateForm(pkr, { transactionId: 'TX-1', amount: '15,000.5' })).toEqual({
      ok: true,
      data: { transactionId: 'TX-1', amount: '1500050' },
    });
    expect(validateForm(pkr, { transactionId: 'TX-1', amount: '' })).toEqual({
      ok: true,
      data: { transactionId: 'TX-1', amount: undefined },
    });
    expect(validateForm(pkr, { transactionId: 'TX-1', amount: '1.234' }).ok).toBe(false);
  });
});

describe('profile form', () => {
  it('checks links and cities, and drops empty optional text', () => {
    const bad = validateForm(profileForm, {
      bio: '',
      qualifications: '',
      socialLinks: [{ label: '', url: 'ftp://x' }],
      f2fLocations: [{ city: 'L', area: '', notes: '' }],
    });
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual([
      'f2fLocations.0.city',
      'socialLinks.0.label',
      'socialLinks.0.url',
    ]);
    const good = validateForm(profileForm, {
      bio: ' About me ',
      qualifications: '',
      socialLinks: [{ label: ' Site ', url: ' https://example.com ' }],
      f2fLocations: [{ city: 'Lahore', area: '', notes: ' By arrangement ' }],
    });
    expect(good).toEqual({
      ok: true,
      data: {
        bio: 'About me',
        qualifications: null,
        socialLinks: [{ label: 'Site', url: 'https://example.com' }],
        f2fLocations: [{ city: 'Lahore', area: undefined, notes: 'By arrangement' }],
      },
    });
  });
});
