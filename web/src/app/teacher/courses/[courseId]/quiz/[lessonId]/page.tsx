import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QuizBuilder } from '@/components/teacher/quiz/QuizBuilder';

export const metadata: Metadata = { title: 'Quiz builder' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The quiz of one QUIZ lesson (#68–#74); the course layout loads and guards the course. */
export default async function TeacherQuizPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  if (!UUID.test(lessonId)) notFound();
  return <QuizBuilder lessonId={lessonId} />;
}
