import { describe, expect, it } from 'vitest';
import { courseDetail } from '@/test/fixtures';
import { courseDescription } from './course-meta';

describe('courseDescription', () => {
  it('uses the teacher’s description, on one line', () => {
    const course = courseDetail({ description: 'Mechanics,\n  waves   and fields.' });
    expect(courseDescription(course)).toBe('Mechanics, waves and fields.');
  });

  it('shortens a long description to 160 characters with an ellipsis', () => {
    const text = courseDescription(courseDetail({ description: 'word '.repeat(100) }));
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.endsWith('…')).toBe(true);
  });

  it('describes the course from its subject, board, level and teacher when there is no description', () => {
    const course = courseDetail({ description: null });
    expect(courseDescription(course)).toBe(
      `${course.subject.name} for ${course.board.name} ${course.level.name}, taught by ${course.teacher.fullName}.`,
    );
  });
});
