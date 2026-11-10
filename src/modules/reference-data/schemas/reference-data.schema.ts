import { z } from 'zod';
import { uuidParams } from '../../../common/schemas';

export const boardParamsSchema = uuidParams('boardId');

export type BoardParams = z.infer<typeof boardParamsSchema>;
