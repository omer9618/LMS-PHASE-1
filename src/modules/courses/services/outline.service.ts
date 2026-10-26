import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { LessonRecord, OutlineDao, SectionRecord } from '../dao/outline.dao';
import { assertContentEditable } from '../domain/course.rules';
import {
  assertLessonContent,
  assertLessonDeletable,
  assertSectionDeletable,
  planMove,
  planReorder,
} from '../domain/outline.rules';
import type {
  CreateLessonInput,
  MoveLessonInput,
  SectionInput,
  UpdateLessonInput,
} from '../schemas/outline.schema';
import { CourseService } from './course.service';

export type { LessonRecord, SectionRecord };

export interface Outline {
  courseId: string;
  sections: SectionRecord[];
}

/**
 * #27: sections and lessons, with ordering and moving lessons between sections. Content is
 * editable while the course is DRAFT or PUBLISHED (decided 2026-10-26). Every change returns the
 * whole outline, so the editor can re-render from one response.
 */
@Injectable()
export class OutlineService {
  constructor(
    private readonly outlineDao: OutlineDao,
    private readonly courseService: CourseService,
    private readonly transactions: TransactionService,
  ) {}

  async getOutline(user: AuthUser, courseId: string): Promise<Outline> {
    const scope = teacherScope(user);
    await this.courseService.loadInScope(scope, courseId);
    return this.outline(scope, courseId);
  }

  /** Admins see the outline while reviewing (#28). */
  async getOutlineForAdmin(admin: AuthUser, courseId: string): Promise<Outline> {
    const scope = adminScope(admin);
    await this.courseService.loadInScope(scope, courseId);
    return this.outline(scope, courseId);
  }

  async createSection(user: AuthUser, courseId: string, input: SectionInput): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    await this.transactions.run(async (tx) => {
      const ids = await this.outlineDao.getSectionIds(courseId, tx);
      await this.outlineDao.createSection(
        courseId,
        { title: input.title, orderIndex: ids.length },
        tx,
      );
    });
    return this.outline(scope, courseId);
  }

  async renameSection(
    user: AuthUser,
    courseId: string,
    sectionId: string,
    input: SectionInput,
  ): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    await this.loadSection(scope, courseId, sectionId);
    await this.outlineDao.updateSection(sectionId, { title: input.title });
    return this.outline(scope, courseId);
  }

  async deleteSection(user: AuthUser, courseId: string, sectionId: string): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    await this.transactions.run(async (tx) => {
      await this.loadSection(scope, courseId, sectionId, tx);
      assertSectionDeletable(await this.outlineDao.countLessonsInSection(sectionId, tx));
      await this.outlineDao.deleteSection(sectionId, tx);
      const remaining = await this.outlineDao.getSectionIds(courseId, tx);
      await this.outlineDao.setSectionOrder(planReorder(remaining, remaining), tx);
    });
    return this.outline(scope, courseId);
  }

  async reorderSections(user: AuthUser, courseId: string, sectionIds: string[]): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    await this.transactions.run(async (tx) => {
      const current = await this.outlineDao.getSectionIds(courseId, tx);
      await this.outlineDao.setSectionOrder(planReorder(current, sectionIds), tx);
    });
    return this.outline(scope, courseId);
  }

  async createLesson(
    user: AuthUser,
    courseId: string,
    sectionId: string,
    input: CreateLessonInput,
  ): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    assertLessonContent(input.type, input.bodyText);
    await this.transactions.run(async (tx) => {
      await this.loadSection(scope, courseId, sectionId, tx);
      const ids = await this.outlineDao.getLessonIds(sectionId, tx);
      await this.outlineDao.createLesson(
        sectionId,
        {
          title: input.title,
          type: input.type,
          orderIndex: ids.length,
          bodyText: input.type === 'TEXT' ? (input.bodyText ?? null) : null,
          isFreePreview: input.isFreePreview ?? false,
        },
        tx,
      );
    });
    return this.outline(scope, courseId);
  }

  /** Title, body text (TEXT lessons) and free-preview flag. The lesson type never changes. */
  async updateLesson(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    input: UpdateLessonInput,
  ): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    const lesson = await this.loadLesson(scope, courseId, lessonId);
    if (input.bodyText !== undefined) {
      if (lesson.type !== 'TEXT') {
        throw new AppException(ErrorCode.VALIDATION_FAILED, { field: 'bodyText' }, undefined, {
          message: 'Only text lessons have body text',
        });
      }
      assertLessonContent(lesson.type, input.bodyText);
    }
    await this.outlineDao.updateLesson(lessonId, input);
    return this.outline(scope, courseId);
  }

  async deleteLesson(user: AuthUser, courseId: string, lessonId: string): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    await this.transactions.run(async (tx) => {
      const lesson = await this.loadLesson(scope, courseId, lessonId, tx);
      assertLessonDeletable(await this.outlineDao.countLessonActivity(lessonId, tx));
      await this.outlineDao.deleteLesson(lessonId, tx);
      const remaining = await this.outlineDao.getLessonIds(lesson.sectionId, tx);
      await this.outlineDao.placeLessons(lesson.sectionId, remaining, tx);
    });
    return this.outline(scope, courseId);
  }

  async reorderLessons(
    user: AuthUser,
    courseId: string,
    sectionId: string,
    lessonIds: string[],
  ): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    await this.transactions.run(async (tx) => {
      await this.loadSection(scope, courseId, sectionId, tx);
      const current = await this.outlineDao.getLessonIds(sectionId, tx);
      const order = planReorder(current, lessonIds);
      await this.outlineDao.placeLessons(sectionId, [...order.keys()], tx);
    });
    return this.outline(scope, courseId);
  }

  /** Moves a lesson to a position in the same or another section of the course (#27). */
  async moveLesson(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    input: MoveLessonInput,
  ): Promise<Outline> {
    const scope = await this.editableCourse(user, courseId);
    await this.transactions.run(async (tx) => {
      const lesson = await this.loadLesson(scope, courseId, lessonId, tx);
      await this.loadSection(scope, courseId, input.sectionId, tx);
      const source = await this.outlineDao.getLessonIds(lesson.sectionId, tx);
      const sameSection = lesson.sectionId === input.sectionId;
      const target = sameSection ? null : await this.outlineDao.getLessonIds(input.sectionId, tx);
      const plan = planMove(lessonId, source, target, input.position);
      await this.outlineDao.placeLessons(lesson.sectionId, plan.source, tx);
      if (plan.target) await this.outlineDao.placeLessons(input.sectionId, plan.target, tx);
    });
    return this.outline(scope, courseId);
  }

  // ── Internals ─────────────────────────────────────────────────────

  /** The teacher's own course, in a status that allows content changes. */
  private async editableCourse(user: AuthUser, courseId: string): Promise<TeacherScope> {
    const scope = teacherScope(user);
    const course = await this.courseService.loadInScope(scope, courseId);
    assertContentEditable(course.status);
    return scope;
  }

  private async outline(scope: TeacherScope, courseId: string): Promise<Outline> {
    return { courseId, sections: await this.outlineDao.getOutline(scope, courseId) };
  }

  private async loadSection(
    scope: TeacherScope,
    courseId: string,
    sectionId: string,
    tx?: TransactionClient,
  ): Promise<SectionRecord> {
    const section = await this.outlineDao.getSectionBy(scope, courseId, sectionId, tx);
    if (!section) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'section', id: sectionId });
    return section;
  }

  private async loadLesson(
    scope: TeacherScope,
    courseId: string,
    lessonId: string,
    tx?: TransactionClient,
  ): Promise<LessonRecord> {
    const lesson = await this.outlineDao.getLessonBy(scope, courseId, lessonId, tx);
    if (!lesson) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'lesson', id: lessonId });
    return lesson;
  }
}
