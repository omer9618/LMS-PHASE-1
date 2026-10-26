import { z } from 'zod';

export const boardParamsSchema = z.object({
  boardId: z.uuid(),
});

export type BoardParams = z.infer<typeof boardParamsSchema>;
