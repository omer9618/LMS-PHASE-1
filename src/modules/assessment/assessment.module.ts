import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AssessmentResultsModule } from './assessment-results.module';
import { CoursesModule } from '../courses/courses.module';
import { QuizAttemptController } from './controllers/quiz-attempt.controller';
import { AdminQuizController, TeacherQuizController } from './controllers/teacher-quiz.controller';
import { AttemptDao } from './dao/attempt.dao';
import { QuizDao } from './dao/quiz.dao';
import { QuestionImageService } from './services/question-image.service';
import { QuizAttemptService } from './services/quiz-attempt.service';
import { QuizBuilderService } from './services/quiz-builder.service';

/** Assessment (#68–#74, #76): quiz builder, MCQ and numeric questions, attempts, reveal rules. */
@Module({
  imports: [CoursesModule, ContentModule, AssessmentResultsModule],
  controllers: [TeacherQuizController, AdminQuizController, QuizAttemptController],
  providers: [QuizBuilderService, QuizAttemptService, QuestionImageService, QuizDao, AttemptDao],
  // Other modules (progress, checkpoint gating #77) import AssessmentResultsModule and use
  // AssessmentService; re-exported here for convenience.
  exports: [AssessmentResultsModule],
})
export class AssessmentModule {}
