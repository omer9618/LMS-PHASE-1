import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

const MAX_DEPTH = 12;

/**
 * Path of the first string holding a NUL character, if any. Postgres cannot store \u0000 in text,
 * so it would otherwise reach the database and come back as a 500.
 */
export function findNulPath(value: unknown, path: string[] = [], depth = 0): string | undefined {
  if (typeof value === 'string') return value.includes('\u0000') ? path.join('.') : undefined;
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) return undefined;
  for (const [key, item] of Object.entries(value)) {
    const found = findNulPath(item, [...path, key], depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Validates one argument (body, params or query) against a Zod schema and returns the parsed value.
 * Usage: `@Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput`.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata): z.output<TSchema> {
    const nulPath = findNulPath(value);
    if (nulPath !== undefined) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, {
        location: metadata.type,
        issues: [{ path: nulPath, code: 'custom', message: 'Must not contain a NUL character' }],
      });
    }
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, {
        location: metadata.type,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
