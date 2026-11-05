import { Module } from '@nestjs/common';
import { AttemptDao } from './dao/attempt.dao';
import { AssessmentService } from './services/assessment.service';
import { AttemptGradingService } from './services/attempt-grading.service';

/**
 * Assessment results for other modules (progress, checkpoint gating #77). Deliberately imports
 * nothing: the content module depends on progress, progress depends on this, and the full
 * AssessmentModule (which needs the content access gate) depends on content. Splitting results
 * out keeps that graph acyclic.
 */
@Module({
  providers: [AssessmentService, AttemptGradingService, AttemptDao],
  // Contract: other modules use AssessmentService; AssessmentModule also uses the grader.
  exports: [AssessmentService, AttemptGradingService],
})
export class AssessmentResultsModule {}
