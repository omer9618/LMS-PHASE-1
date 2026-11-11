-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_action_entity_id_created_at_idx" ON "audit_log"("action", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

-- CreateIndex
CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");

-- CreateIndex
CREATE INDEX "courses_status_published_at_idx" ON "courses"("status", "published_at");

-- CreateIndex
CREATE INDEX "enrollments_course_id_idx" ON "enrollments"("course_id");

-- CreateIndex
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_resources_lesson_id_idx" ON "lesson_resources"("lesson_id");

-- CreateIndex
CREATE INDEX "lessons_section_id_idx" ON "lessons"("section_id");

-- CreateIndex
CREATE INDEX "order_items_teacher_id_idx" ON "order_items"("teacher_id");

-- CreateIndex
CREATE INDEX "order_items_course_id_idx" ON "order_items"("course_id");

-- CreateIndex
CREATE INDEX "orders_student_id_idx" ON "orders"("student_id");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_proofs_order_id_idx" ON "payment_proofs"("order_id");

-- CreateIndex
CREATE INDEX "payment_verifications_order_id_idx" ON "payment_verifications"("order_id");

-- CreateIndex
CREATE INDEX "payout_disputes_payout_id_idx" ON "payout_disputes"("payout_id");

-- CreateIndex
CREATE INDEX "payouts_teacher_id_idx" ON "payouts"("teacher_id");

-- CreateIndex
CREATE INDEX "question_responses_question_id_idx" ON "question_responses"("question_id");

-- CreateIndex
CREATE INDEX "questions_quiz_id_idx" ON "questions"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts"("quiz_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "sections_course_id_idx" ON "sections"("course_id");

-- CreateIndex
CREATE INDEX "teacher_ledger_order_item_id_idx" ON "teacher_ledger"("order_item_id");

-- CreateIndex
CREATE INDEX "teacher_ledger_payout_id_idx" ON "teacher_ledger"("payout_id");
