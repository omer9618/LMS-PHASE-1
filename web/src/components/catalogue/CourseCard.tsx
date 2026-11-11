import Link from 'next/link';
import { Badge } from '@/components/ui';
import type { CourseCard as CourseCardData } from '@/lib/api/schemas/catalogue';
import { PACING_LABELS } from '@/lib/format';
import { formatPrice } from '@/lib/money';
import styles from './Catalogue.module.css';

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardBadges}>
        <Badge tone="primary">{course.subject.name}</Badge>
        <Badge>{course.board.name}</Badge>
        <Badge>{course.level.name}</Badge>
      </div>
      <h3 className={styles.cardTitle}>
        <Link href={`/courses/${course.id}`}>{course.title}</Link>
      </h3>
      {course.syllabusArea && <p className={styles.cardSyllabus}>{course.syllabusArea}</p>}
      <p className={styles.cardTeacher}>
        <span className="visually-hidden">Teacher: </span>
        {course.teacher.fullName ?? 'Teacher'}
      </p>
      <div className={styles.cardFooter}>
        <span className={styles.price}>
          <span className="visually-hidden">Price: </span>
          {formatPrice(course)}
        </span>
        <span className="hint">{PACING_LABELS[course.progressionMode]}</span>
        {!course.isEnrollmentOpen && <Badge tone="warning">Enrolment closed</Badge>}
      </div>
    </article>
  );
}
