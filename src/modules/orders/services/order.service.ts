import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { CourseService } from '../../courses/services/course.service';
import { EnrollmentAccessService } from '../../enrollment/services/enrollment-access.service';
import { buildCartQuote, CartQuote, PurchasableCourseFacts } from '../domain/order.rules';
import type { CartPreviewInput } from '../schemas/order.schema';

export interface CartPreviewItemView {
  courseId: string;
  title: string;
  teacherId: string;
  teacherName: string | null;
  priceMinor: bigint;
  currency: string;
}

export interface CartPreviewView {
  items: CartPreviewItemView[];
  currency: string;
  totalMinor: bigint;
  teacherCount: number;
}

/**
 * Orders and cart (#54). Validates multi-teacher carts and computes totals in minor units.
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly courseService: CourseService,
    private readonly enrollmentAccess: EnrollmentAccessService,
  ) {}

  /**
   * #54: validates a multi-teacher cart and returns the student-facing summary.
   * Internal commission splits are computed by the domain rules (for #56) and never exposed here.
   */
  async previewCart(user: AuthUser, input: CartPreviewInput): Promise<CartPreviewView> {
    const quote = await this.quoteCart(user, input.courseIds);
    return {
      items: quote.items.map((item) => ({
        courseId: item.courseId,
        title: item.title,
        teacherId: item.teacherId,
        teacherName: item.teacherName,
        priceMinor: item.priceMinor,
        currency: item.currency,
      })),
      currency: quote.currency,
      totalMinor: quote.totalMinor,
      teacherCount: quote.teacherCount,
    };
  }

  /** Computes the full cart quote (including frozen commission splits for order creation). */
  async quoteCart(user: AuthUser, requestedCourseIds: readonly string[]): Promise<CartQuote> {
    const uniqueIds = [...new Set(requestedCourseIds)];
    const rawCourses = await this.courseService.getSaleFacts(uniqueIds);
    const foundIds = new Set(rawCourses.map((c) => c.id));
    for (const id of uniqueIds) {
      if (!foundIds.has(id)) {
        throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id });
      }
    }

    const activeEnrolledIds = new Set<string>();
    await Promise.all(
      uniqueIds.map(async (courseId) => {
        if (await this.enrollmentAccess.hasActiveEnrollment(user.id, courseId)) {
          activeEnrolledIds.add(courseId);
        }
      }),
    );

    const facts: PurchasableCourseFacts[] = rawCourses.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      audienceType: c.audienceType,
      isFree: c.isFree,
      isEnrollmentOpen: c.isEnrollmentOpen,
      priceMinor: c.priceMinor,
      currency: c.currency,
      commissionRateBps: c.commissionRateBps,
      teacherId: c.teacherId,
      teacherName: c.teacher.fullName,
      teacherActive: c.teacher.status === UserStatus.ACTIVE,
    }));

    return buildCartQuote(uniqueIds, facts, user.id, activeEnrolledIds);
  }
}
