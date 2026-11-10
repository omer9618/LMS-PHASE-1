import type { Metadata } from 'next';
import { TeacherApplicationForm } from '@/components/onboarding/TeacherApplicationForm';

export const metadata: Metadata = {
  title: 'Teach with us',
  description: 'Apply to teach Cambridge and Edexcel courses.',
};

export default function TeachWithUsPage() {
  return <TeacherApplicationForm />;
}
