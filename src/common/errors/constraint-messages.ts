/**
 * Client-facing messages for named database constraints. When Prisma reports a violation of one
 * of these, the exception filter uses this message instead of the generic one.
 * Add an entry whenever a constraint can be hit by valid-looking user input.
 */
export const CONSTRAINT_MESSAGES: Record<string, string> = {
  courses_level_id_board_id_fkey: 'The selected level does not belong to the selected board',
  courses_board_id_fkey: 'The selected board does not exist',
  courses_subject_id_fkey: 'The selected subject does not exist',
  courses_publish_guard: 'A published course must be free or have both a price and a commission',
  users_email_key: 'An account with this email already exists',
};
