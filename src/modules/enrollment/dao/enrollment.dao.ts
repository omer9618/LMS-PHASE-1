import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const enrollmentAccessSelect = {
  id: true,
  status: true,
  expiresAt: true,
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentAccessRecord = Prisma.EnrollmentGetPayload<{
  select: typeof enrollmentAccessSelect;
}>;

@Injectable()
export class EnrollmentDao {
  constructor(private readonly prisma: PrismaService) {}

  /** One enrollment per student per course (unique), so this is the student's only row. */
  getEnrollmentForAccess(
    studentId: string,
    courseId: string,
  ): Promise<EnrollmentAccessRecord | null> {
    return this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: enrollmentAccessSelect,
    });
  }
}
