import { z } from 'zod';
import { cvFile, email, fullName, optionalText } from './fields';

/** The public "teach with us" application (#18, #19). */
export const teacherApplicationForm = z.object({
  applicantName: fullName,
  applicantEmail: email,
  applicantPhone: optionalText,
  subjects: optionalText,
  cv: cvFile,
});

/** The multipart body: optional fields are left out when empty. */
export function applicationFormData(
  data: z.output<typeof teacherApplicationForm>,
  captchaToken: string,
): FormData {
  const form = new FormData();
  form.append('applicantName', data.applicantName);
  form.append('applicantEmail', data.applicantEmail);
  if (data.applicantPhone) form.append('applicantPhone', data.applicantPhone);
  if (data.subjects) form.append('subjects', data.subjects);
  form.append('captchaToken', captchaToken);
  form.append('cv', data.cv);
  return form;
}
