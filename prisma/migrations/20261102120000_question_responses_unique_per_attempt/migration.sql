-- Assessment (#73, #74): one response per question per attempt, so progressive saves upsert.
CREATE UNIQUE INDEX "question_responses_attempt_id_question_id_key" ON "question_responses"("attempt_id", "question_id");
