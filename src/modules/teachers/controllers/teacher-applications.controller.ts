import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RateLimit } from '../../../common/rate-limit/rate-limits';
import { UPLOAD_POLICIES } from '../../storage/domain/upload-policy';
import {
  SubmitApplicationInput,
  submitApplicationSchema,
} from '../schemas/teacher-application.schema';
import {
  SubmittedApplication,
  TeacherApplicationService,
} from '../services/teacher-application.service';

/** #18: the public "teach with us" form. Multipart: text fields plus a `cv` file. */
@Public()
@Controller('teacher-applications')
export class TeacherApplicationsController {
  constructor(private readonly applicationService: TeacherApplicationService) {}

  @Post()
  @RateLimit('APPLICATION_SUBMIT')
  @UseInterceptors(
    FileInterceptor('cv', {
      // Hard cap while receiving; the upload policy then checks the real size and type.
      limits: { fileSize: UPLOAD_POLICIES.CV.maxBytes, files: 1, fields: 10, fieldSize: 8 * 1024 },
    }),
  )
  submit(
    @Body(new ZodValidationPipe(submitApplicationSchema)) body: SubmitApplicationInput,
    @UploadedFile() cv: Express.Multer.File | undefined,
  ): Promise<SubmittedApplication> {
    return this.applicationService.submit(body, cv);
  }
}
