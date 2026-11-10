import { describe, expect, it } from 'vitest';
import {
  ERRORS,
  ErrorCode,
  RequestAbortedError,
  RequestError,
  errorMessage,
  fieldErrors,
  isRequestError,
} from './errors';
import { shouldRetry } from '../query';

describe('RequestError', () => {
  it('takes its status and fallback message from the catalog', () => {
    const error = new RequestError(ErrorCode.NOT_FOUND);
    expect(error.status).toBe(ERRORS.NOT_FOUND.status);
    expect(error.message).toBe(ERRORS.NOT_FOUND.message);
    expect(error.name).toBe('NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
  });

  it("shows the server's sentence for domain errors", () => {
    const error = new RequestError(ErrorCode.ORDER_REFUSED, {
      message: 'You already own this course.',
    });
    expect(error.userMessage).toBe('You already own this course.');
  });

  it('shows the fixed catalog sentence for errors whose server text is not for people', () => {
    const error = new RequestError(ErrorCode.INTERNAL, { message: 'TypeError: x is undefined' });
    expect(error.userMessage).toBe(ERRORS.INTERNAL.message);
    expect(
      new RequestError(ErrorCode.RATE_LIMITED, { message: 'ThrottlerException' }).userMessage,
    ).toBe(ERRORS.RATE_LIMITED.message);
  });

  it('keeps a code the web does not know yet, with its server text', () => {
    const error = new RequestError('SOMETHING_NEW', { message: 'New rule.', status: 409 });
    expect(error.status).toBe(409);
    expect(error.userMessage).toBe('New rule.');
    expect(error.retryable).toBe(false);
  });

  it('marks only network and server failures as retryable', () => {
    expect(new RequestError(ErrorCode.NETWORK_ERROR).retryable).toBe(true);
    expect(new RequestError(ErrorCode.INTERNAL).retryable).toBe(true);
    expect(new RequestError(ErrorCode.SERVICE_UNAVAILABLE).retryable).toBe(true);
    expect(new RequestError(ErrorCode.VALIDATION_FAILED).retryable).toBe(false);
    expect(new RequestError(ErrorCode.UNAUTHENTICATED).retryable).toBe(false);
  });
});

describe('helpers', () => {
  it('isRequestError checks the class and, optionally, the code', () => {
    const error = new RequestError(ErrorCode.CONFLICT);
    expect(isRequestError(error)).toBe(true);
    expect(isRequestError(error, ErrorCode.CONFLICT)).toBe(true);
    expect(isRequestError(error, ErrorCode.NOT_FOUND)).toBe(false);
    expect(isRequestError(new Error('x'))).toBe(false);
  });

  it('errorMessage never shows raw text from a non-API error', () => {
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(errorMessage(new RequestAbortedError())).toBe('Something went wrong. Please try again.');
  });

  it('a cancelled request is not a RequestError', () => {
    expect(new RequestAbortedError()).not.toBeInstanceOf(RequestError);
  });

  it('fieldErrors reads Zod issues and single-field rules', () => {
    const error = new RequestError(ErrorCode.VALIDATION_FAILED, {
      message: 'Password too short',
      info: { issues: [{ path: 'email', message: 'Invalid email' }], field: 'password' },
    });
    expect(fieldErrors(error)).toEqual({ email: 'Invalid email', password: 'Password too short' });
    expect(fieldErrors(new RequestError(ErrorCode.CONFLICT))).toEqual({});
  });
});

describe('shouldRetry', () => {
  it('retries retryable errors at most twice', () => {
    const error = new RequestError(ErrorCode.NETWORK_ERROR);
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it('never retries a 4xx answer or a non-API error', () => {
    expect(shouldRetry(0, new RequestError(ErrorCode.NOT_FOUND))).toBe(false);
    expect(shouldRetry(0, new Error('x'))).toBe(false);
  });
});
