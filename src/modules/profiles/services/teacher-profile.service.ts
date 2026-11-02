import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { UserAdminService } from '../../auth/services/user-admin.service';
import { CatalogueListing, CatalogueService } from '../../catalogue/services/catalogue.service';
import {
  contentTypeForKey,
  IncomingFile,
  StorageService,
} from '../../storage/services/storage.service';
import { TeacherProfileDao, TeacherProfileRecord } from '../dao/teacher-profile.dao';
import {
  decideEdit,
  decidePublish,
  decideUnpublish,
  EMPTY_PROFILE,
  F2fLocation,
  ProfileState,
  readJsonList,
  SocialLink,
} from '../domain/profile.rules';
import type { PublicProfileQuery, UpdateProfileInput } from '../schemas/teacher-profile.schema';

/** audit_log.action values written by this service (entity_type `teacher_profile`). */
export const PROFILE_AUDIT_ACTIONS = {
  PUBLISHED: 'TEACHER_PROFILE_PUBLISHED',
  UNPUBLISHED: 'TEACHER_PROFILE_UNPUBLISHED',
  ADMIN_EDITED: 'TEACHER_PROFILE_EDITED_BY_ADMIN',
  ADMIN_UNPUBLISHED: 'TEACHER_PROFILE_UNPUBLISHED_BY_ADMIN',
  ADMIN_PHOTO_REMOVED: 'TEACHER_PROFILE_PHOTO_REMOVED_BY_ADMIN',
} as const;

const ENTITY = 'teacher_profile';

/** What the teacher (and an admin) sees: the whole profile, published or not. */
export interface TeacherProfileView {
  teacherId: string;
  fullName: string | null;
  bio: string | null;
  qualifications: string | null;
  socialLinks: SocialLink[];
  f2fLocations: F2fLocation[];
  /** A short-lived signed URL, never the storage key. */
  photoUrl: string | null;
  isPublished: boolean;
  /** Set while the profile is unpublished because an admin unpublished it (#100). */
  moderation: { unpublishedAt: Date; reason: string | null } | null;
}

/** The public page (#99): everything an indexable profile page needs, nothing private. */
export interface PublicTeacherProfile {
  teacherId: string;
  fullName: string | null;
  bio: string | null;
  qualifications: string | null;
  socialLinks: SocialLink[];
  f2fLocations: F2fLocation[];
  photoUrl: string | null;
  courses: CatalogueListing;
}

/**
 * Teacher public profiles (#98–#100). The teacher edits and publishes their own profile; anyone
 * can read a published profile of an active teacher; admins can edit or unpublish any profile.
 */
@Injectable()
export class TeacherProfileService {
  constructor(
    private readonly profileDao: TeacherProfileDao,
    private readonly catalogue: CatalogueService,
    private readonly userAdmin: UserAdminService,
    private readonly storage: StorageService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    @InjectPinoLogger(TeacherProfileService.name) private readonly logger: PinoLogger,
  ) {}

  // ── Teacher (#98) ─────────────────────────────────────────────────

  async getMine(user: AuthUser): Promise<TeacherProfileView> {
    const scope = teacherScope(user);
    const profile = await this.profileDao.getProfile(scope, user.id);
    return this.toView(profile, user.id, user.fullName);
  }

  /** Creates the profile on first save. Edits to a published profile go live immediately. */
  async updateMine(user: AuthUser, input: UpdateProfileInput): Promise<TeacherProfileView> {
    const scope = teacherScope(user);
    await this.transactions.run(async (tx) => {
      const current = await this.profileDao.getProfile(scope, user.id, tx);
      const { next } = decideEdit(toState(current), input);
      await this.profileDao.upsertProfile(scope, user.id, toData(next), tx);
    });
    return this.getMine(user);
  }

  async publishMine(user: AuthUser): Promise<TeacherProfileView> {
    await this.setVisibility(user, teacherScope(user), user.id, true, null);
    return this.getMine(user);
  }

  async unpublishMine(user: AuthUser): Promise<TeacherProfileView> {
    await this.setVisibility(user, teacherScope(user), user.id, false, null);
    return this.getMine(user);
  }

  /** PROFILE_PHOTO policy (png, jpeg, webp; 2 MB). Replaces and deletes the previous photo. */
  async uploadPhoto(user: AuthUser, file: IncomingFile | undefined): Promise<TeacherProfileView> {
    const scope = teacherScope(user);
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, { field: 'photo' }, undefined, {
        message: 'A photo file is required',
      });
    }
    const stored = await this.storage.store('PROFILE_PHOTO', `profile-photos/${user.id}`, file);
    let previous: string | null;
    try {
      previous = await this.transactions.run(async (tx) => {
        const current = await this.profileDao.getProfile(scope, user.id, tx);
        await this.profileDao.upsertProfile(scope, user.id, { photoUrl: stored.key }, tx);
        return current?.photoUrl ?? null;
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
    await this.deleteFile(previous);
    return this.getMine(user);
  }

  async removePhoto(user: AuthUser): Promise<TeacherProfileView> {
    const scope = teacherScope(user);
    const previous = await this.clearPhoto(scope, user.id, null);
    await this.deleteFile(previous);
    return this.getMine(user);
  }

  // ── Public (#99) ──────────────────────────────────────────────────

  /** 404 unless the profile is published and its teacher is active. */
  async getPublic(teacherId: string, query: PublicProfileQuery): Promise<PublicTeacherProfile> {
    const profile = await this.profileDao.getPublicProfile(teacherId);
    if (!profile) throw notFound(teacherId);
    const [courses, photoUrl] = await Promise.all([
      this.catalogue.listForTeacher(teacherId, query),
      this.signPhoto(profile.photoUrl),
    ]);
    const state = toState(profile);
    return {
      teacherId,
      fullName: profile.user.fullName,
      bio: state.bio,
      qualifications: state.qualifications,
      socialLinks: state.socialLinks,
      f2fLocations: state.f2fLocations,
      photoUrl,
      courses,
    };
  }

  // ── Admin moderation (#100) ───────────────────────────────────────

  async adminGet(admin: AuthUser, teacherId: string): Promise<TeacherProfileView> {
    const scope = adminScope(admin);
    const teacher = await this.loadTeacher(admin, teacherId);
    const profile = await this.profileDao.getProfile(scope, teacherId);
    return this.toView(profile, teacherId, teacher.fullName);
  }

  /** Edits any teacher's profile fields. Audited with the list of changed fields. */
  async adminUpdate(
    admin: AuthUser,
    teacherId: string,
    input: UpdateProfileInput,
  ): Promise<TeacherProfileView> {
    const scope = adminScope(admin);
    await this.loadTeacher(admin, teacherId);
    await this.transactions.run(async (tx) => {
      const current = await this.profileDao.getProfile(scope, teacherId, tx);
      const { next, changed } = decideEdit(toState(current), input);
      if (changed.length === 0) return;
      await this.profileDao.upsertProfile(scope, teacherId, toData(next), tx);
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: PROFILE_AUDIT_ACTIONS.ADMIN_EDITED,
          entityType: ENTITY,
          entityId: teacherId,
          details: { fields: changed },
        },
        tx,
      );
    });
    return this.adminGet(admin, teacherId);
  }

  /** Takes a profile off public view, with a reason the teacher sees. Audited. */
  async adminUnpublish(
    admin: AuthUser,
    teacherId: string,
    reason: string,
  ): Promise<TeacherProfileView> {
    const scope = adminScope(admin);
    await this.loadTeacher(admin, teacherId);
    await this.setVisibility(admin, scope, teacherId, false, reason);
    return this.adminGet(admin, teacherId);
  }

  /** Removes an unsuitable photo. Audited with the reason. */
  async adminRemovePhoto(
    admin: AuthUser,
    teacherId: string,
    reason: string,
  ): Promise<TeacherProfileView> {
    const scope = adminScope(admin);
    await this.loadTeacher(admin, teacherId);
    const previous = await this.clearPhoto(scope, teacherId, { admin, reason });
    await this.deleteFile(previous);
    return this.adminGet(admin, teacherId);
  }

  // ── Internals ─────────────────────────────────────────────────────

  /** `reason` set means an admin is unpublishing (#100); otherwise the teacher acts on their own. */
  private async setVisibility(
    actor: AuthUser,
    scope: TeacherScope,
    teacherId: string,
    publish: boolean,
    reason: string | null,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const current = toState(await this.profileDao.getProfile(scope, teacherId, tx));
      if (publish) decidePublish(current);
      else decideUnpublish(current);
      const updated = await this.profileDao.setPublished(
        scope,
        teacherId,
        current.isPublished,
        publish,
        tx,
      );
      if (!updated) {
        throw new AppException(ErrorCode.INVALID_STATE_TRANSITION, undefined, undefined, {
          message: 'The profile changed while this request was in progress. Reload it.',
        });
      }
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: publish
            ? PROFILE_AUDIT_ACTIONS.PUBLISHED
            : reason !== null
              ? PROFILE_AUDIT_ACTIONS.ADMIN_UNPUBLISHED
              : PROFILE_AUDIT_ACTIONS.UNPUBLISHED,
          entityType: ENTITY,
          entityId: teacherId,
          details: reason !== null ? { reason } : undefined,
        },
        tx,
      );
    });
  }

  /** Clears the photo column and returns the old key, to delete once the change is committed. */
  private clearPhoto(
    scope: TeacherScope,
    teacherId: string,
    moderation: { admin: AuthUser; reason: string } | null,
  ): Promise<string | null> {
    return this.transactions.run(async (tx) => {
      const current = await this.profileDao.getProfile(scope, teacherId, tx);
      if (!current?.photoUrl) return null;
      await this.profileDao.upsertProfile(scope, teacherId, { photoUrl: null }, tx);
      if (moderation) {
        await this.audit.record(
          {
            actorUserId: moderation.admin.id,
            action: PROFILE_AUDIT_ACTIONS.ADMIN_PHOTO_REMOVED,
            entityType: ENTITY,
            entityId: teacherId,
            details: { reason: moderation.reason },
          },
          tx,
        );
      }
      return current.photoUrl;
    });
  }

  private async deleteFile(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (err) {
      // The row no longer points at it; an orphaned file is harmless and can be swept later.
      this.logger.error({ err, key }, 'Old profile photo delete failed');
    }
  }

  private async toView(
    profile: TeacherProfileRecord | null,
    teacherId: string,
    fullName: string | null,
  ): Promise<TeacherProfileView> {
    const state = toState(profile);
    const [photoUrl, moderation] = await Promise.all([
      this.signPhoto(profile?.photoUrl ?? null),
      profile && !profile.isPublished ? this.moderationNote(teacherId) : null,
    ]);
    return {
      teacherId,
      fullName: profile?.user.fullName ?? fullName,
      bio: state.bio,
      qualifications: state.qualifications,
      socialLinks: state.socialLinks,
      f2fLocations: state.f2fLocations,
      photoUrl,
      isPublished: state.isPublished,
      moderation,
    };
  }

  /**
   * Why an admin unpublished the profile, if that is the latest visibility change. The caller has
   * already been authorised for this profile (its owner, or an admin).
   */
  private async moderationNote(
    teacherId: string,
  ): Promise<{ unpublishedAt: Date; reason: string | null } | null> {
    const [adminUnpublished, published] = await Promise.all([
      this.audit.latestFor(ENTITY, PROFILE_AUDIT_ACTIONS.ADMIN_UNPUBLISHED, [teacherId]),
      this.audit.latestFor(ENTITY, PROFILE_AUDIT_ACTIONS.PUBLISHED, [teacherId]),
    ]);
    const entry = adminUnpublished.get(teacherId);
    if (!entry) return null;
    const republished = published.get(teacherId);
    if (republished && republished.createdAt > entry.createdAt) return null;
    const details = entry.details as Prisma.JsonObject | null;
    const reason = details?.reason;
    return { unpublishedAt: entry.createdAt, reason: typeof reason === 'string' ? reason : null };
  }

  private async signPhoto(key: string | null): Promise<string | null> {
    if (!key) return null;
    const extension = key.split('.').pop() ?? 'jpg';
    return this.storage.downloadUrl(key, `profile.${extension}`, contentTypeForKey(key));
  }

  /** Admin routes act on teachers only: anything else is 404, like an unknown id. */
  private async loadTeacher(admin: AuthUser, teacherId: string) {
    const user = await this.userAdmin.getUser(admin, teacherId);
    if (!user.roles.includes(Role.TEACHER)) throw notFound(teacherId);
    return user;
  }
}

function notFound(teacherId: string): AppException {
  return new AppException(ErrorCode.NOT_FOUND, { entity: 'teacher_profile', id: teacherId });
}

function toState(profile: TeacherProfileRecord | null): ProfileState {
  if (!profile) return EMPTY_PROFILE;
  return {
    bio: profile.bio,
    qualifications: profile.qualifications,
    socialLinks: readJsonList<SocialLink>(profile.socialLinks),
    f2fLocations: readJsonList<F2fLocation>(profile.f2fLocations),
    isPublished: profile.isPublished,
  };
}

function toData(fields: ReturnType<typeof decideEdit>['next']) {
  return {
    bio: fields.bio,
    qualifications: fields.qualifications,
    socialLinks: fields.socialLinks as unknown as Prisma.InputJsonValue,
    f2fLocations: fields.f2fLocations as unknown as Prisma.InputJsonValue,
  };
}
