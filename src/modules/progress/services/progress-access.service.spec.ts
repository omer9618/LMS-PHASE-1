import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { AssessmentService } from '../../assessment/services/assessment.service';
import type { CourseStructureRecord, ProgressDao } from '../dao/progress.dao';
import { ProgressAccessService } from './progress-access.service';

const lesson = (id: string, type: 'VIDEO' | 'QUIZ', isBreakpoint = false) => ({
  id,
  title: `Lesson ${id}`,
  type,
  orderIndex: 0,
  isFreePreview: false,
  videoAsset: type === 'VIDEO' ? { durationSeconds: 100 } : null,
  quiz: type === 'QUIZ' ? { id: `quiz-${id}`, isBreakpoint, passingScorePct: 60 } : null,
});

const course = {
  id: 'course',
  title: 'Course',
  status: 'PUBLISHED',
  teacherId: 'teacher',
  progressionMode: 'FREE',
  sections: [
    {
      id: 's1',
      title: 'Unit',
      orderIndex: 0,
      lessons: [lesson('q', 'QUIZ', true), lesson('v', 'VIDEO')],
    },
  ],
} as unknown as CourseStructureRecord;

function setup(passed: Map<string, Date>) {
  const dao = {
    getCourseStructure: jest.fn().mockResolvedValue(course),
    getCompletions: jest.fn().mockResolvedValue([]),
    recordCompletions: jest.fn().mockResolvedValue(1),
  };
  const assessment = { passedQuizLessonIds: jest.fn().mockResolvedValue(passed) };
  return {
    dao,
    service: new ProgressAccessService(
      dao as unknown as ProgressDao,
      assessment as unknown as AssessmentService,
    ),
  };
}

describe('ProgressAccessService', () => {
  it('locks lessons behind an unpassed checkpoint with LESSON_LOCKED and the cause', async () => {
    const { service, dao } = setup(new Map());
    const error = await service.assertLessonUnlocked('student', 'course', 'v').catch((e) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(ErrorCode.LESSON_LOCKED);
    expect(error.info).toMatchObject({ cause: 'CHECKPOINT_NOT_PASSED', blockingLessonId: 'q' });
    expect(dao.recordCompletions).not.toHaveBeenCalled();
  });

  it('records a passed quiz lazily as a QUIZ completion and unlocks', async () => {
    const at = new Date('2026-11-01T00:00:00Z');
    const { service, dao } = setup(new Map([['q', at]]));
    await expect(service.assertLessonUnlocked('student', 'course', 'v')).resolves.toBeUndefined();
    expect(dao.recordCompletions).toHaveBeenCalledWith([
      { studentId: 'student', lessonId: 'q', source: 'QUIZ', completedAt: at },
    ]);
  });

  it('lets unknown courses through to the caller’s own checks', async () => {
    const { service, dao } = setup(new Map());
    dao.getCourseStructure.mockResolvedValue(null);
    await expect(service.assertLessonUnlocked('s', 'missing', 'v')).resolves.toBeUndefined();
  });
});
