import type { Metadata } from 'next';
import { QuizBuilder } from '@/components/teacher/quiz/QuizBuilder';
import { requireId } from '@/lib/route-params';

export const metadata: Metadata = { title: 'Quiz builder' };

/** The quiz of one QUIZ lesson (#68–#74); the course layout loads and guards the course. */
export default async function TeacherQuizPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  requireId(lessonId);
  return <QuizBuilder lessonId={lessonId} />;
}
