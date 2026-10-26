import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
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
import {
  LessonContentParams,
  lessonContentParamsSchema,
  ResourceParams,
  resourceParamsSchema,
  StartVideoUploadInput,
  startVideoUploadSchema,
} from '../schemas/content.schema';
import { ResourceService, ResourceView } from '../services/resource.service';
import { UploadTicket, VideoAssetView, VideoService } from '../services/video.service';

/** #36 video upload and #38 resources, for the teacher's own lessons. */
@Roles([Role.TEACHER])
@Controller('teacher/courses/:courseId/lessons/:lessonId')
export class TeacherContentController {
  constructor(
    private readonly videoService: VideoService,
    private readonly resourceService: ResourceService,
  ) {}

  /** Returns TUS credentials; the browser uploads the file straight to the video host. */
  @Post('video')
  startUpload(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(lessonContentParamsSchema)) params: LessonContentParams,
    @Body(new ZodValidationPipe(startVideoUploadSchema)) body: StartVideoUploadInput,
  ): Promise<UploadTicket> {
    return this.videoService.startUpload(user, params.courseId, params.lessonId, body.title);
  }

  @Post('video/refresh')
  @HttpCode(200)
  refresh(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(lessonContentParamsSchema)) params: LessonContentParams,
  ): Promise<VideoAssetView> {
    return this.videoService.refresh(user, params.courseId, params.lessonId);
  }

  @Post('resources')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_POLICIES.LESSON_RESOURCE.maxBytes, files: 1, fields: 0 },
    }),
  )
  uploadResource(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(lessonContentParamsSchema)) params: LessonContentParams,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ResourceView[]> {
    return this.resourceService.upload(user, params.courseId, params.lessonId, file);
  }

  @Delete('resources/:resourceId')
  removeResource(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(resourceParamsSchema)) params: ResourceParams,
  ): Promise<ResourceView[]> {
    return this.resourceService.remove(user, params.courseId, params.lessonId, params.resourceId);
  }
}
