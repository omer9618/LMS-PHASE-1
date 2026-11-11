import { z } from 'zod';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { findNulPath, ZodValidationPipe } from './zod-validation.pipe';

describe('findNulPath', () => {
  it('finds a NUL in a nested string and reports where', () => {
    expect(findNulPath({ a: { b: ['ok', 'x\u0000y'] } })).toBe('a.b.1');
  });

  it('returns undefined for clean input and for non-objects', () => {
    expect(findNulPath({ a: 'fine', b: [1, null, true] })).toBeUndefined();
    expect(findNulPath(undefined)).toBeUndefined();
  });
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.strictObject({ name: z.string() }));

  it('turns a NUL character into a 400 validation error before the schema runs', () => {
    try {
      pipe.transform({ name: 'a\u0000b' }, { type: 'body' });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.VALIDATION_FAILED);
      expect((error as AppException).status).toBe(400);
    }
  });

  it('passes valid input through', () => {
    expect(pipe.transform({ name: 'ok' }, { type: 'body' })).toEqual({ name: 'ok' });
  });
});
