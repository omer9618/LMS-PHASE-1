import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { CoursesModule } from '../courses/courses.module';
import { QuizAttemptController } from './controllers/quiz-attempt.controller';
import { AdminQuizController, TeacherQuizController } from './controllers/teacher-quiz.controller';
import { AttemptDao } from './dao/attempt.dao';
import { QuizDao } from './dao/quiz.dao';
import { AssessmentService } from './services/assessment.service';
import { QuestionImageService } from './services/question-image.service';
import { QuizAttemptService } from './services/quiz-attempt.service';
import { QuizBuilderService } from './services/quiz-builder.service';

/** Assessment (#68–#74, #76): quiz builder, MCQ and numeric questions, attempts, reveal rules. */
@Module({
  imports: [CoursesModule, ContentModule],
  controllers: [TeacherQuizController, AdminQuizController, QuizAttemptController],
  providers: [
    QuizBuilderService,
    QuizAttemptService,
    AssessmentService,
    QuestionImageService,
    QuizDao,
    AttemptDao,
  ],
  // Contract: other modules (progress, checkpoint gating #77) use AssessmentService only.
  exports: [AssessmentService],
})
export class AssessmentModule {}
