'use client';

import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  Input,
  Select,
  Textarea,
  Icon,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { moveItem, teacherApi } from '@/lib/api/teacher';
import type { AuthoringLesson, AuthoringSection, Outline } from '@/lib/api/schemas/teacher';
import type { LessonType } from '@/lib/api/schemas/catalogue';
import { contentEditable } from '@/lib/teacher/course-status';
import { formatDuration } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { useCourseWorkspace } from './CourseWorkspace';
import { ResourcesPanel } from './ResourcesPanel';
import { VideoPanel } from './VideoPanel';
import styles from './Outline.module.css';

export const LESSON_TYPES: Array<{ value: LessonType; label: string }> = [
  { value: 'VIDEO', label: 'Video' },
  { value: 'TEXT', label: 'Reading (text)' },
  { value: 'PDF', label: 'Reading (PDF)' },
  { value: 'QUIZ', label: 'Quiz' },
];

const TYPE_LABEL = Object.fromEntries(LESSON_TYPES.map((t) => [t.value, t.label])) as Record<
  string,
  string
>;

/** Runs an outline change, keeps the answer, and announces the result. */
export interface OutlineActions {
  courseId: string;
  editable: boolean;
  sections: AuthoringSection[];
  run: (change: () => Promise<Outline>, done: string) => Promise<boolean>;
}

/**
 * #27: sections and lessons. Reordering uses Move up / Move down buttons (keyboard and screen
 * reader friendly) rather than drag and drop. Every change answers with the whole outline.
 */
export function OutlineEditor() {
  const { course } = useCourseWorkspace();
  const loaded = useQuery({
    queryKey: ['outline', course.id],
    queryFn: ({ signal }) => teacherApi.getOutline(course.id, signal),
  });
  const [changed, setChanged] = useState<Outline | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const editable = contentEditable(course.status);

  if (loaded.status === 'pending') return <p role="status">Loading the content…</p>;
  if (loaded.status === 'error') {
    return (
      <Alert tone="danger" title="Could not load the content">
        <p>{errorMessage(loaded.error)}</p>
        <Button size="sm" variant="secondary" onClick={() => void loaded.refetch()}>
          Try again
        </Button>
      </Alert>
    );
  }

  const outline = changed ?? loaded.data;
  const actions: OutlineActions = {
    courseId: course.id,
    editable,
    sections: outline.sections,
    run: async (change, done) => {
      setError(null);
      try {
        setChanged(await change());
        setNotice(done);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        setNotice('');
        return false;
      }
    },
  };

  return (
    <div className="stack">
      {!editable && (
        <Alert tone="info">
          {course.status === 'PENDING_APPROVAL'
            ? 'The course is in review, so its content is locked until an admin decides.'
            : 'This course can no longer be edited.'}
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <p role="status" className="visually-hidden">
        {notice}
      </p>
      {outline.sections.length === 0 && (
        <p className="muted">No sections yet. Add the first one below.</p>
      )}
      <ol className={styles.sections}>
        {outline.sections.map((section, index) => (
          <li key={section.id}>
            <SectionCard section={section} index={index} actions={actions} />
          </li>
        ))}
      </ol>
      {editable && <AddSectionForm actions={actions} />}
    </div>
  );
}

function SectionCard({
  section,
  index,
  actions,
}: {
  section: AuthoringSection;
  index: number;
  actions: OutlineActions;
}) {
  const { courseId, editable, sections, run } = actions;
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(section.title);
  const headingId = `section-${section.id}`;
  const order = sections.map((s) => s.id);

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h2 id={headingId} className={styles.sectionTitle}>
          <span className="muted">Section {index + 1}: </span>
          {section.title}
        </h2>
        {editable && (
          <div className={styles.toolbar}>
            <Button
              size="sm"
              variant="ghost"
              disabled={index === 0}
              aria-label={`Move section “${section.title}” up`}
              onClick={() =>
                void run(
                  () => teacherApi.orderSections(courseId, moveItem(order, index, -1)),
                  `Moved “${section.title}” up`,
                )
              }
            >
              <Icon name="arrowUp" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={index === sections.length - 1}
              aria-label={`Move section “${section.title}” down`}
              onClick={() =>
                void run(
                  () => teacherApi.orderSections(courseId, moveItem(order, index, 1)),
                  `Moved “${section.title}” down`,
                )
              }
            >
              <Icon name="arrowDown" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRenaming((r) => !r)}>
              Rename
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (
                  section.lessons.length === 0 ||
                  window.confirm(
                    `Delete “${section.title}” and its ${section.lessons.length} lesson${section.lessons.length === 1 ? '' : 's'}?`,
                  )
                ) {
                  void run(
                    () => teacherApi.deleteSection(courseId, section.id),
                    `Deleted “${section.title}”`,
                  );
                }
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      {renaming && (
        <form
          className={styles.inlineForm}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const ok = await run(
              () => teacherApi.renameSection(courseId, section.id, title.trim()),
              'Section renamed',
            );
            if (ok) setRenaming(false);
          }}
        >
          <Input
            label="Section title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      )}
      {section.lessons.length === 0 ? (
        <p className="muted">No lessons in this section.</p>
      ) : (
        <ol className={styles.lessons}>
          {section.lessons.map((lesson, lessonIndex) => (
            <li key={lesson.id}>
              <LessonRow lesson={lesson} index={lessonIndex} section={section} actions={actions} />
            </li>
          ))}
        </ol>
      )}
      {editable && <AddLessonForm sectionId={section.id} actions={actions} />}
    </section>
  );
}

function LessonRow({
  lesson,
  index,
  section,
  actions,
}: {
  lesson: AuthoringLesson;
  index: number;
  section: AuthoringSection;
  actions: OutlineActions;
}) {
  const { courseId, editable, sections, run } = actions;
  const [open, setOpen] = useState(false);
  const order = section.lessons.map((l) => l.id);
  const panelId = `lesson-panel-${lesson.id}`;
  const duration = formatDuration(lesson.videoAsset?.durationSeconds);

  return (
    <div className={styles.lesson}>
      <div className="cluster">
        <span className={styles.lessonTitle}>{lesson.title}</span>
        <span className={styles.badges}>
          <Badge>{TYPE_LABEL[lesson.type] ?? lesson.type}</Badge>
          {lesson.isFreePreview && <Badge tone="info">Free preview</Badge>}
          {lesson.type === 'VIDEO' && !lesson.videoAsset && <Badge tone="warning">No video</Badge>}
          {lesson.videoAsset?.status === 'PROCESSING' && <Badge tone="info">Processing</Badge>}
          {lesson.videoAsset?.status === 'FAILED' && <Badge tone="danger">Video failed</Badge>}
          {duration && <span className="muted">{duration}</span>}
          {lesson.resources.length > 0 && (
            <span className="muted">
              {lesson.resources.length} {lesson.resources.length === 1 ? 'file' : 'files'}
            </span>
          )}
        </span>
        <div className={styles.toolbar}>
          {editable && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={index === 0}
                aria-label={`Move lesson “${lesson.title}” up`}
                onClick={() =>
                  void run(
                    () => teacherApi.orderLessons(courseId, section.id, moveItem(order, index, -1)),
                    `Moved “${lesson.title}” up`,
                  )
                }
              >
                <Icon name="arrowUp" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={index === section.lessons.length - 1}
                aria-label={`Move lesson “${lesson.title}” down`}
                onClick={() =>
                  void run(
                    () => teacherApi.orderLessons(courseId, section.id, moveItem(order, index, 1)),
                    `Moved “${lesson.title}” down`,
                  )
                }
              >
                <Icon name="arrowDown" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? 'Close' : editable ? 'Edit' : 'View'} ${lesson.title}`}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Close' : editable ? 'Edit' : 'View'}
          </Button>
        </div>
      </div>
      {open && (
        <div id={panelId} className={styles.lessonPanel}>
          <LessonEditor lesson={lesson} actions={actions} />
          {lesson.type === 'QUIZ' && (
            <p>
              <ButtonLink
                size="sm"
                variant="secondary"
                href={`/teacher/courses/${courseId}/quiz/${lesson.id}`}
              >
                {editable ? 'Build the quiz' : 'View the quiz'}
              </ButtonLink>
            </p>
          )}
          {lesson.type === 'VIDEO' && (
            <VideoPanel
              courseId={courseId}
              lesson={lesson}
              editable={editable}
              onChanged={() => run(() => teacherApi.getOutline(courseId), 'Video updated')}
            />
          )}
          <ResourcesPanel
            courseId={courseId}
            lesson={lesson}
            editable={editable}
            onChanged={() => run(() => teacherApi.getOutline(courseId), 'Files updated')}
          />
          {editable && sections.length > 1 && (
            <MoveLessonForm lesson={lesson} currentSectionId={section.id} actions={actions} />
          )}
          {editable && (
            <div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Delete the lesson “${lesson.title}”?`)) {
                    void run(
                      () => teacherApi.deleteLesson(courseId, lesson.id),
                      `Deleted “${lesson.title}”`,
                    );
                  }
                }}
              >
                Delete lesson
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LessonEditor({ lesson, actions }: { lesson: AuthoringLesson; actions: OutlineActions }) {
  const { courseId, editable, run } = actions;
  const [title, setTitle] = useState(lesson.title);
  const [bodyText, setBodyText] = useState(lesson.bodyText ?? '');

  async function save(event: FormEvent) {
    event.preventDefault();
    const change: { title?: string; bodyText?: string } = {};
    if (title.trim() && title.trim() !== lesson.title) change.title = title.trim();
    if (lesson.type === 'TEXT' && bodyText !== (lesson.bodyText ?? '')) change.bodyText = bodyText;
    if (Object.keys(change).length === 0) return;
    await run(() => teacherApi.updateLesson(courseId, lesson.id, change), 'Lesson saved');
  }

  return (
    <div className="stack">
      <Checkbox
        label="Free preview"
        hint="Anyone can watch it before enrolling. A video lesson with a free preview is the course demo."
        checked={lesson.isFreePreview}
        disabled={!editable}
        onChange={(e) =>
          void run(
            () => teacherApi.updateLesson(courseId, lesson.id, { isFreePreview: e.target.checked }),
            e.target.checked ? 'Marked as a free preview' : 'No longer a free preview',
          )
        }
      />
      {editable && (
        <form className="stack" onSubmit={save}>
          <Input
            label="Lesson title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
          {lesson.type === 'TEXT' && (
            <Textarea
              label="Lesson text"
              rows={8}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
          )}
          <div>
            <Button type="submit" size="sm" variant="secondary">
              Save lesson
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function MoveLessonForm({
  lesson,
  currentSectionId,
  actions,
}: {
  lesson: AuthoringLesson;
  currentSectionId: string;
  actions: OutlineActions;
}) {
  const { courseId, sections, run } = actions;
  const others = sections.filter((s) => s.id !== currentSectionId);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  return (
    <form
      className={styles.inlineForm}
      onSubmit={(e) => {
        e.preventDefault();
        const section = sections.find((s) => s.id === target);
        if (!section) return;
        void run(
          () => teacherApi.moveLesson(courseId, lesson.id, section.id, section.lessons.length),
          `Moved “${lesson.title}” to “${section.title}”`,
        );
      }}
    >
      <Select label="Move to section" value={target} onChange={(e) => setTarget(e.target.value)}>
        {others.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" variant="secondary">
        Move
      </Button>
    </form>
  );
}

function AddSectionForm({ actions }: { actions: OutlineActions }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className={styles.addForm}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) {
          setError('Give the section a title');
          return;
        }
        setError(undefined);
        const ok = await actions.run(
          () => teacherApi.addSection(actions.courseId, title.trim()),
          `Added section “${title.trim()}”`,
        );
        if (ok) setTitle('');
      }}
    >
      <Input
        label="New section"
        placeholder="e.g. Kinematics"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        error={error}
      />
      <Button type="submit" variant="secondary">
        Add section
      </Button>
    </form>
  );
}

function AddLessonForm({ sectionId, actions }: { sectionId: string; actions: OutlineActions }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<LessonType>('VIDEO');
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className={styles.addForm}
      noValidate
      aria-label="Add a lesson"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) {
          setError('Give the lesson a title');
          return;
        }
        setError(undefined);
        const ok = await actions.run(
          () => teacherApi.addLesson(actions.courseId, sectionId, { title: title.trim(), type }),
          `Added lesson “${title.trim()}”`,
        );
        if (ok) setTitle('');
      }}
    >
      <Input
        label="New lesson"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        error={error}
      />
      <Select label="Type" value={type} onChange={(e) => setType(e.target.value as LessonType)}>
        {LESSON_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" size="sm">
        Add lesson
      </Button>
    </form>
  );
}
