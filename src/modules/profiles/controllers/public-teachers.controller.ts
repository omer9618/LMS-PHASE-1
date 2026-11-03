import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  PublicProfileQuery,
  publicProfileQuerySchema,
  TeacherIdParams,
  teacherIdParamsSchema,
} from '../schemas/teacher-profile.schema';
import { PublicTeacherProfile, TeacherProfileService } from '../services/teacher-profile.service';

/** #99: the public teacher profile page. Published profiles of active teachers only. */
@Public()
@Controller('teachers')
export class PublicTeachersController {
  constructor(private readonly profileService: TeacherProfileService) {}

  @Get(':teacherId')
  get(
    @Param(new ZodValidationPipe(teacherIdParamsSchema)) params: TeacherIdParams,
    @Query(new ZodValidationPipe(publicProfileQuerySchema)) query: PublicProfileQuery,
  ): Promise<PublicTeacherProfile> {
    return this.profileService.getPublic(params.teacherId, query);
  }
}
