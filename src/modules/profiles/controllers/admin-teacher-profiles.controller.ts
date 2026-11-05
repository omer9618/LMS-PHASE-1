import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  ModerationReasonInput,
  moderationReasonSchema,
  TeacherIdParams,
  teacherIdParamsSchema,
  UpdateProfileInput,
  updateProfileSchema,
} from '../schemas/teacher-profile.schema';
import { TeacherProfileService, TeacherProfileView } from '../services/teacher-profile.service';

/** #100: admin moderation of any teacher's profile. Every change is audited. */
@Roles([Role.ADMIN])
@Controller('admin/teachers/:teacherId/profile')
export class AdminTeacherProfilesController {
  constructor(private readonly profileService: TeacherProfileService) {}

  @Get()
  get(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(teacherIdParamsSchema)) params: TeacherIdParams,
  ): Promise<TeacherProfileView> {
    return this.profileService.adminGet(admin, params.teacherId);
  }

  @Put()
  update(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(teacherIdParamsSchema)) params: TeacherIdParams,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<TeacherProfileView> {
    return this.profileService.adminUpdate(admin, params.teacherId, body);
  }

  @Post('unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(teacherIdParamsSchema)) params: TeacherIdParams,
    @Body(new ZodValidationPipe(moderationReasonSchema)) body: ModerationReasonInput,
  ): Promise<TeacherProfileView> {
    return this.profileService.adminUnpublish(admin, params.teacherId, body.reason);
  }

  @Post('photo/remove')
  @HttpCode(200)
  removePhoto(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(teacherIdParamsSchema)) params: TeacherIdParams,
    @Body(new ZodValidationPipe(moderationReasonSchema)) body: ModerationReasonInput,
  ): Promise<TeacherProfileView> {
    return this.profileService.adminRemovePhoto(admin, params.teacherId, body.reason);
  }
}
