'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MathText } from '@/components/learn/MathText';
import { Alert, Badge, Button, Loadable, PageHeader, Section, SplitLayout } from '@/components/ui';
import { errorMessage, isApiError } from '@/lib/api/errors';
import { quizBuilderApi, type QuizQuestion, type TeacherQuiz } from '@/lib/api/quiz-builder';
import { type QuestionInput } from '@/lib/forms/quiz';
import { moveItem } from '@/lib/api/teacher';
import { contentEditable } from '@/lib/course-status';
import { useApi } from '@/lib/use-api';
import { useCourseWorkspace } from '../CourseWorkspace';
import { QuestionEditor } from './QuestionEditor';
import { QuizSettings } from './QuizSettings';
import styles from './QuizBuilder.module.css';

/** `null` while nothing is selected; "new" for a question not saved yet. */
type Selection = string | 'new' | null;

/**
 * The quiz builder (#68–#74): rules on top, the question list on the left, the selected question's
 * editor and its student preview on the right. Every change answers with the whole quiz, which
 * replaces what is shown.
 */
export function QuizBuilder({ lessonId }: { lessonId: string }) {
  const { course } = useCourseWorkspace();
  const editable = contentEditable(course.status);
  const loaded = useApi(`quiz:${course.id}:${lessonId}`, async (signal) => {
    try {
      return await quizBuilderApi.get(course.id, lessonId, signal);
    } catch (error) {
      // A quiz lesson without a quiz yet: show the "create" form rather than an error.
      if (isApiError(error, 'NOT_FOUND')) return null;
      throw error;
    }
  });
  // The newest quiz after a change made here.
  const [changed, setChanged] = useState<TeacherQuiz | null | undefined>(undefined);
  const [selected, setSelected] = useState<Selection>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Runs a change, shows its result, and says what happened (also to screen readers). */
  async function run(action: () => Promise<TeacherQuiz>, done: string): Promise<boolean> {
    setError(null);
    try {
      setChanged(await action());
      setNotice(done);
      return true;
    } catch (e) {
      setNotice(null);
      setError(errorMessage(e));
      return false;
    }
  }

  const contentHref = `/teacher/courses/${course.id}/content`;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <>
            <Link href={contentHref}>Content</Link> / Quiz
          </>
        }
        title="Quiz builder"
        description="Questions may use LaTeX between $ signs. Numeric answers are compared as exact decimals within the tolerance you set."
      />
      {!editable && (
        <Alert tone="info">
          This course is {course.status === 'PENDING_APPROVAL' ? 'in review' : 'not editable'}; the
          quiz is shown read-only.
        </Alert>
      )}
      <p role="status" className="visually-hidden">
        {notice}
      </p>
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && (
        <Alert tone="danger" title="That did not work">
          {error}
        </Alert>
      )}
      <Loadable state={loaded} what="the quiz">
        {(initial) => {
          const quiz = changed === undefined ? initial : changed;
          if (!quiz) {
            return (
              <Section title="Set the rules to start" raised>
                {editable ? (
                  <QuizSettings
                    quiz={null}
                    submitLabel="Create quiz"
                    onSave={(settings) =>
                      run(
                        () => quizBuilderApi.create(course.id, lessonId, settings),
                        'Quiz created',
                      )
                    }
                  />
                ) : (
                  <p className="muted">This lesson has no quiz yet.</p>
                )}
              </Section>
            );
          }
          const current =
            selected === 'new' ? null : (quiz.questions.find((q) => q.id === selected) ?? null);
          const order = quiz.questions.map((q) => q.id);
          const save = (input: QuestionInput) =>
            current
              ? run(
                  () => quizBuilderApi.updateQuestion(course.id, lessonId, current.id, input),
                  'Question saved',
                )
              : run(async () => {
                  const next = await quizBuilderApi.addQuestion(course.id, lessonId, input);
                  setSelected(next.questions.at(-1)?.id ?? null);
                  return next;
                }, 'Question added');

          return (
            <>
              <Section title="Rules">
                <QuizSettings
                  key={quiz.id}
                  quiz={quiz}
                  readOnly={!editable}
                  submitLabel="Save rules"
                  onSave={(settings) =>
                    run(() => quizBuilderApi.update(course.id, lessonId, settings), 'Rules saved')
                  }
                />
                {quiz.attemptCount > 0 && (
                  <p className="muted">
                    Students have made {quiz.attemptCount}{' '}
                    {quiz.attemptCount === 1 ? 'attempt' : 'attempts'}. Questions they answered can
                    no longer be deleted.
                  </p>
                )}
              </Section>
              <SplitLayout
                aside={
                  <Section
                    flush
                    title="Questions"
                    actions={
                      <span className="eyebrow">
                        {quiz.questions.length}{' '}
                        {quiz.questions.length === 1 ? 'question' : 'questions'} · {quiz.totalMarks}{' '}
                        marks
                      </span>
                    }
                  >
                    <QuestionList
                      questions={quiz.questions}
                      selected={selected}
                      editable={editable}
                      onSelect={setSelected}
                      onMove={(index, step) =>
                        run(
                          () =>
                            quizBuilderApi.orderQuestions(
                              course.id,
                              lessonId,
                              moveItem(order, index, step),
                            ),
                          'Question moved',
                        )
                      }
                    />
                    {editable && (
                      <div className={styles.listFoot}>
                        <Button size="sm" variant="secondary" onClick={() => setSelected('new')}>
                          Add a question
                        </Button>
                      </div>
                    )}
                  </Section>
                }
                main={
                  selected === null ? (
                    <Section title="Question">
                      <p className="muted">
                        {quiz.questions.length === 0
                          ? 'No questions yet. Add the first one.'
                          : 'Choose a question to edit it, or add a new one.'}
                      </p>
                    </Section>
                  ) : (
                    <QuestionEditor
                      key={current?.id ?? 'new'}
                      question={current}
                      number={current ? order.indexOf(current.id) + 1 : quiz.questions.length + 1}
                      readOnly={!editable}
                      onSave={save}
                      onDelete={
                        current
                          ? async () => {
                              const ok = await run(
                                () =>
                                  quizBuilderApi.deleteQuestion(course.id, lessonId, current.id),
                                'Question deleted',
                              );
                              if (ok) setSelected(null);
                            }
                          : undefined
                      }
                    />
                  )
                }
              />
            </>
          );
        }}
      </Loadable>
    </div>
  );
}

function QuestionList({
  questions,
  selected,
  editable,
  onSelect,
  onMove,
}: {
  questions: QuizQuestion[];
  selected: Selection;
  editable: boolean;
  onSelect: (id: string) => void;
  onMove: (index: number, step: -1 | 1) => void;
}) {
  if (questions.length === 0) return <p className={styles.empty}>No questions yet.</p>;
  return (
    <ol className={styles.list}>
      {questions.map((q, index) => (
        <li key={q.id} className={styles.item} data-selected={q.id === selected || undefined}>
          <button
            type="button"
            className={styles.itemButton}
            aria-current={q.id === selected ? 'true' : undefined}
            onClick={() => onSelect(q.id)}
          >
            <span className="mono">Q{index + 1}</span>
            <span className={styles.itemText}>
              <MathText text={q.contentText} />
            </span>
            <Badge>{q.type === 'MCQ' ? 'Choice' : 'Numeric'}</Badge>
            <span className={styles.marks}>[{q.marks}]</span>
          </button>
          {editable && (
            <span className={styles.moves}>
              <Button
                size="sm"
                variant="ghost"
                disabled={index === 0}
                aria-label={`Move question ${index + 1} up`}
                onClick={() => onMove(index, -1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={index === questions.length - 1}
                aria-label={`Move question ${index + 1} down`}
                onClick={() => onMove(index, 1)}
              >
                ↓
              </Button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
