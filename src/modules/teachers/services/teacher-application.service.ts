import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma, Role } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService, Paged } from '../../audit/services/audit.service';
import { UserAdminService } from '../../auth/services/user-admin.service';
import { CaptchaService } from '../../captcha/services/captcha.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import {
  contentTypeForKey,
  IncomingFile,
  StorageService,
} from '../../storage/services/storage.service';
import { ApplicationRecord, TeacherApplicationDao } from '../dao/teacher-application.dao';
import { decideLink, decideReview, ReviewDecision } from '../domain/application.rules';
import type {
  CreateTeacherFromApplicationInput,
  ListApplicationsQuery,
  ReviewApplicationInput,
  SubmitApplicationInput,
} from '../schemas/teacher-application.schema';

export type { ApplicationRecord };

/** The applicant only learns that the application arrived. */
export interface SubmittedApplication {
  id: string;
  status: ApplicationStatus;
  submittedAt: Date;
}

const CV_URL_TTL_SECONDS = 5 * 60;

/** Teacher onboarding (#18–#21, #23): public applications, admin review, account linking, purge. */
@Injectable()
export class TeacherApplicationService {
  constructor(
    private readonly applicationDao: TeacherApplicationDao,
    private readonly storage: StorageService,
    private readonly captcha: CaptchaService,
    private readonly settings: PlatformSettingsService,
    private readonly userAdmin: UserAdminService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    @InjectPinoLogger(TeacherApplicationService.name) private readonly logger: PinoLogger,
  ) {}

  /** #18: unauthenticated submission with a CV, behind a captcha (and a rate limit on the route). */
  async submit(
    input: SubmitApplicationInput,
    cv: IncomingFile | undefined,
  ): Promise<SubmittedApplication> {
    await this.captcha.assertHuman(input.captchaToken);
    if (!cv) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, { field: 'cv' }, undefined, {
        message: 'A CV file is required',
      });
    }

    // #19: the CV goes to object storage, never the app server.
    const stored = await this.storage.store('CV', 'cv', cv);
    try {
      const application = await this.applicationDao.createApplication({
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        applicantPhone: input.applicantPhone ?? null,
        subjects: input.subjects ?? null,
        cvUrl: stored.key,
      });
      return {
        id: application.id,
        status: application.status,
        submittedAt: application.createdAt,
      };
    } catch (error) {
      // Don't leave an orphaned CV behind if the row could not be written.
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  /** #20: the review queue, oldest first. */
  async list(admin: AuthUser, query: ListApplicationsQuery): Promise<Paged<ApplicationRecord>> {
    adminScope(admin);
    const where: Prisma.TeacherApplicationWhereInput = {
      status: query.status,
      OR: query.q
        ? [
            { applicantName: { contains: query.q, mode: 'insensitive' } },
            { applicantEmail: { contains: query.q, mode: 'insensitive' } },
            { subjects: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.applicationDao.getApplicationsBy(where, query),
      this.applicationDao.countApplicationsBy(where),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  async get(admin: AuthUser, applicationId: string): Promise<ApplicationRecord> {
    adminScope(admin);
    return this.load(applicationId);
  }

  /** #19/#20: a short-lived download link for the CV. CV access is personal data, so audited. */
  async cvDownloadUrl(
    admin: AuthUser,
    applicationId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    adminScope(admin);
    const application = await this.load(applicationId);
    const extension = application.cvUrl.split('.').pop() ?? 'pdf';
    const url = await this.storage.downloadUrl(
      application.cvUrl,
      `${application.applicantName} CV.${extension}`,
      contentTypeForKey(application.cvUrl),
      CV_URL_TTL_SECONDS,
    );
    await this.audit.record({
      actorUserId: admin.id,
      action: 'APPLICATION_CV_DOWNLOADED',
      entityType: 'teacher_application',
      entityId: applicationId,
    });
    return { url, expiresInSeconds: CV_URL_TTL_SECONDS };
  }

  /** #20: mark under review, rejected or hired, recording who and when. */
  async review(
    admin: AuthUser,
    applicationId: string,
    input: ReviewApplicationInput,
  ): Promise<ApplicationRecord> {
    adminScope(admin);
    const application = await this.load(applicationId);
    const retentionDays = await this.settings.get('APPLICATION_RETENTION_DAYS');
    const decision = decideReview(application.status, input.status, new Date(), retentionDays);
    return this.applyDecision(admin, application, decision, 'APPLICATION_REVIEWED', {
      notes: input.notes,
    });
  }

  /**
   * #21: creates the teacher's account from the application (same email; the teacher sets their
   * password from the emailed link) and links it, hiring the applicant.
   */
  async createTeacherAccount(
    admin: AuthUser,
    applicationId: string,
    input: CreateTeacherFromApplicationInput,
  ): Promise<ApplicationRecord> {
    adminScope(admin);
    const application = await this.load(applicationId);
    decideLink(application.status, new Date()); // fail before creating an account we can't link
    const account = await this.userAdmin.createAccount(admin, {
      email: application.applicantEmail,
      fullName: input.fullName ?? application.applicantName,
      roles: [Role.TEACHER],
    });
    return this.link(admin, applicationId, account.id);
  }

  /** #21: links an existing teacher account to the application it came from. */
  async link(admin: AuthUser, applicationId: string, userId: string): Promise<ApplicationRecord> {
    adminScope(admin);
    const [application, user] = await Promise.all([
      this.load(applicationId),
      this.userAdmin.getUser(admin, userId),
    ]);
    if (!user.roles.includes(Role.TEACHER)) {
      throw new AppException(ErrorCode.CONFLICT, { userId }, undefined, {
        message: 'Only a teacher account can be linked to an application. Grant TEACHER first.',
      });
    }
    if (application.user && application.user.id !== userId) {
      throw new AppException(ErrorCode.CONFLICT, undefined, undefined, {
        message: 'This application is already linked to another account',
      });
    }
    const decision = decideLink(application.status, new Date());
    return this.applyDecision(admin, application, decision, 'APPLICATION_LINKED', { userId });
  }

  /**
   * #23: deletes rejected applications past their retention date, with their CVs.
   * Called daily by ApplicationPurgeJob, or by an admin on demand.
   */
  async purgeExpired(actor: AuthUser | null, today = new Date()): Promise<{ purged: number }> {
    if (actor) adminScope(actor);
    const due = await this.applicationDao.getPurgeableApplications(today);
    if (due.length === 0) return { purged: 0 };

    // Files first: a failed delete leaves the row, so the next run retries it.
    const deletable: string[] = [];
    for (const application of due) {
      try {
        await this.storage.delete(application.cvUrl);
        deletable.push(application.id);
      } catch (err) {
        this.logger.error({ err, applicationId: application.id }, 'CV delete failed during purge');
      }
    }

    const purged = await this.transactions.run(async (tx) => {
      const count = await this.applicationDao.deleteRejectedApplications(deletable, tx);
      await this.audit.record(
        {
          actorUserId: actor?.id ?? null,
          action: 'APPLICATIONS_PURGED',
          entityType: 'teacher_application',
          details: { count, applicationIds: deletable },
        },
        tx,
      );
      return count;
    });
    this.logger.info({ purged }, 'Purged expired teacher applications');
    return { purged };
  }

  private async applyDecision(
    admin: AuthUser,
    application: ApplicationRecord,
    decision: ReviewDecision,
    action: string,
    extra: { notes?: string; userId?: string },
  ): Promise<ApplicationRecord> {
    return this.transactions.run(async (tx) => {
      const updated = await this.applicationDao.updateApplication(
        application.id,
        application.status,
        {
          status: decision.status,
          reviewedAt: decision.reviewedAt,
          reviewedById: admin.id,
          purgeAfter: decision.purgeAfter,
          ...(extra.notes !== undefined ? { reviewNotes: extra.notes } : {}),
          ...(extra.userId ? { userId: extra.userId } : {}),
        },
        tx,
      );
      if (!updated) {
        throw new AppException(ErrorCode.INVALID_STATE_TRANSITION, undefined, undefined, {
          message: 'The application changed while this request was in progress. Reload it.',
        });
      }
      await this.audit.record(
        {
          actorUserId: admin.id,
          action,
          entityType: 'teacher_application',
          entityId: application.id,
          details: {
            from: application.status,
            to: decision.status,
            ...(extra.notes ? { notes: extra.notes } : {}),
            ...(extra.userId ? { userId: extra.userId } : {}),
          },
        },
        tx,
      );
      return updated;
    });
  }

  private async load(applicationId: string): Promise<ApplicationRecord> {
    const application = await this.applicationDao.getApplicationBy({ id: applicationId });
    if (!application) {
      throw new AppException(ErrorCode.NOT_FOUND, {
        entity: 'teacher_application',
        id: applicationId,
      });
    }
    return application;
  }
}
