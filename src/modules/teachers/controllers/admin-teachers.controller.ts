import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AdminUserView } from '../../auth/services/user-admin.service';
import {
  DeactivateTeacherInput,
  deactivateTeacherSchema,
  TeacherIdParams,
  teacherIdParamsSchema,
} from '../schemas/teacher-application.schema';
import { TeacherAdminService } from '../services/teacher-admin.service';

/** #22: teacher deactivation. Suspension uses POST /admin/users/:id/suspend (#15). */
@Roles([Role.ADMIN])
@Controller('admin/teachers')
export class AdminTeachersController {
  constructor(private readonly teacherAdmin: TeacherAdminService) {}

  @Post(':teacherId/deactivate')
  @HttpCode(200)
  deactivate(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(teacherIdParamsSchema)) params: TeacherIdParams,
    @Body(new ZodValidationPipe(deactivateTeacherSchema)) body: DeactivateTeacherInput,
  ): Promise<AdminUserView> {
    return this.teacherAdmin.deactivate(admin, params.teacherId, body.reason);
  }
}
