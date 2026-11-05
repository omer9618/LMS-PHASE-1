import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { UPLOAD_POLICIES } from '../../storage/domain/upload-policy';
import { UpdateProfileInput, updateProfileSchema } from '../schemas/teacher-profile.schema';
import { TeacherProfileService, TeacherProfileView } from '../services/teacher-profile.service';

/** #98: the signed-in teacher's own public profile. */
@Roles([Role.TEACHER])
@Controller('teacher/profile')
export class TeacherProfileController {
  constructor(private readonly profileService: TeacherProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<TeacherProfileView> {
    return this.profileService.getMine(user);
  }

  @Put()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<TeacherProfileView> {
    return this.profileService.updateMine(user, body);
  }

  @Post('publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser): Promise<TeacherProfileView> {
    return this.profileService.publishMine(user);
  }

  @Post('unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() user: AuthUser): Promise<TeacherProfileView> {
    return this.profileService.unpublishMine(user);
  }

  /** Multipart with a `photo` file part. */
  @Post('photo')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: UPLOAD_POLICIES.PROFILE_PHOTO.maxBytes, files: 1, fields: 0 },
    }),
  )
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @UploadedFile() photo: Express.Multer.File | undefined,
  ): Promise<TeacherProfileView> {
    return this.profileService.uploadPhoto(user, photo);
  }

  @Delete('photo')
  removePhoto(@CurrentUser() user: AuthUser): Promise<TeacherProfileView> {
    return this.profileService.removePhoto(user);
  }
}
