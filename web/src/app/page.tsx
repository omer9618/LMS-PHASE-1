import type { Metadata } from 'next';
import { Home } from '@/components/home/Home';

export const metadata: Metadata = {
  title: { absolute: 'LMS · Cambridge and Edexcel courses' },
  description:
    'Courses from independent teachers for Cambridge and Edexcel students. Free previews, bank-transfer payment, timed quizzes.',
};

export default function HomePage() {
  return <Home />;
}
