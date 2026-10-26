import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import type { TransactionService } from '../../../prisma/transaction.service';
import type { ReferenceDataService } from '../../reference-data/services/reference-data.service';
import type { AuditService } from '../../audit/services/audit.service';
import type { CourseDao, CourseRecord } from '../dao/course.dao';
import { PublishGuardError } from '../domain/course.rules';
import { CourseService } from './course.service';

const user = (id: string, ...roles: Role[]): AuthUser => ({
  id,
  email: `${id}@test.local`,
  roles: new Set(roles),
  sessionId: 'session',
});

const teacher = user('teacher-1', Role.TEACHER);
const admin = user('admin-1', Role.ADMIN);

const course = (overrides: Partial<CourseRecord> = {}): CourseRecord =>
  ({
    id: 'course-1',
    teacherId: teacher.id,
    status: 'PENDING_APPROVAL',
    isFree: false,
    priceMinor: 150000n,
    commissionRateBps: 2000,
    ...overrides,
  }) as CourseRecord;

describe('CourseService (mocked DAOs)', () => {
  const tx = { marker: 'tx' };
  let courseDao: jest.Mocked<Pick<CourseDao, 'getCourseBy' | 'updateCourse'>>;
  let audit: jest.Mocked<Pick<AuditService, 'record' | 'latestFor'>>;
  let service: CourseService;

  beforeEach(() => {
    courseDao = { getCourseBy: jest.fn(), updateCourse: jest.fn() };
    audit = { record: jest.fn(), latestFor: jest.fn() };
    const transactions = {
      run: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as TransactionService;

    service = new CourseService(
      courseDao as unknown as CourseDao,
      audit as unknown as AuditService,
      {} as ReferenceDataService,
      transactions,
    );
  });

  it('reads a teacher course through the teacher scope and hides other teachers’ courses as 404', async () => {
    courseDao.getCourseBy.mockResolvedValue(null);

    await expect(service.getMyCourse(teacher, 'course-of-someone-else')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    expect(courseDao.getCourseBy).toHaveBeenCalledWith(
      { teacherId: 'teacher-1' },
      { id: 'course-of-someone-else' },
    );
  });

  it('gives the teacher the rejection reason of their rejected course, looked up only for that id', async () => {
    courseDao.getCourseBy.mockResolvedValue(course({ status: 'REJECTED' }));
    audit.latestFor.mockResolvedValue(
      new Map([['course-1', { details: { reason: 'Latest reason' } }]]) as never,
    );

    await expect(service.getMyCourse(teacher, 'course-1')).resolves.toMatchObject({
      rejectionReason: 'Latest reason',
    });
    expect(audit.latestFor).toHaveBeenCalledWith('course', 'COURSE_REJECTED', ['course-1']);
  });

  it('does not query the audit log for courses that are not rejected', async () => {
    courseDao.getCourseBy.mockResolvedValue(course({ status: 'DRAFT' }));

    await expect(service.getMyCourse(teacher, 'course-1')).resolves.toMatchObject({
      rejectionReason: null,
    });
    expect(audit.latestFor).not.toHaveBeenCalled();
  });

  it('refuses teacher operations for a user without the TEACHER role, before any query', async () => {
    await expect(service.getMyCourse(admin, 'course-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(courseDao.getCourseBy).not.toHaveBeenCalled();
  });

  it('approves: conditional update and audit entry, both inside the same transaction', async () => {
    const published = course({ status: 'PUBLISHED' });
    courseDao.getCourseBy.mockResolvedValue(course());
    courseDao.updateCourse.mockResolvedValue(published);

    await expect(service.approveCourse(admin, 'course-1')).resolves.toEqual({
      ...published,
      rejectionReason: null,
    });

    expect(courseDao.getCourseBy).toHaveBeenCalledWith({ admin: true }, { id: 'course-1' });
    expect(courseDao.updateCourse).toHaveBeenCalledWith(
      { admin: true },
      { id: 'course-1', expectedStatus: 'PENDING_APPROVAL' },
      { status: 'PUBLISHED', publishedAt: expect.any(Date) },
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'COURSE_APPROVED',
        entityType: 'course',
        entityId: 'course-1',
      }),
      tx,
    );
  });

  it('does not write anything when the publish guard fails', async () => {
    courseDao.getCourseBy.mockResolvedValue(course({ priceMinor: null }));

    await expect(service.approveCourse(admin, 'course-1')).rejects.toBeInstanceOf(
      PublishGuardError,
    );
    expect(courseDao.updateCourse).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('stores the rejection reason in the audit entry', async () => {
    courseDao.getCourseBy.mockResolvedValue(course());
    courseDao.updateCourse.mockResolvedValue(course({ status: 'REJECTED' }));

    await service.rejectCourse(admin, 'course-1', { reason: 'Syllabus area is missing' });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COURSE_REJECTED',
        details: { from: 'PENDING_APPROVAL', to: 'REJECTED', reason: 'Syllabus area is missing' },
      }),
      tx,
    );
  });

  it('reports a concurrent change instead of overwriting it, and writes no audit entry', async () => {
    courseDao.getCourseBy.mockResolvedValue(course());
    courseDao.updateCourse.mockResolvedValue(null);

    const result = service.approveCourse(admin, 'course-1');
    await expect(result).rejects.toBeInstanceOf(AppException);
    await expect(result).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
