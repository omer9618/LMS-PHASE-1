import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { DomainError } from '../errors/domain.error';
import { ErrorCode } from '../errors/error-codes';
import { toErrorBody } from './all-exceptions.filter';

function prismaError(code: string, cause: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('raw prisma message', {
    code,
    clientVersion: 'test',
    meta: { driverAdapterError: { cause } },
  });
}

class SampleDomainError extends DomainError {
  readonly code = 'SOMETHING_DOMAIN_SPECIFIC';
}

describe('toErrorBody', () => {
  it('passes AppException through with its status and info', () => {
    const body = toErrorBody(new AppException(ErrorCode.FORBIDDEN, { id: 'x' }));
    expect(body).toMatchObject({ status: 403, name: 'FORBIDDEN', info: { id: 'x' } });
  });

  it('maps the composite course FK violation to a clean 400', () => {
    const body = toErrorBody(
      prismaError('P2003', { constraint: { index: 'courses_level_id_board_id_fkey' } }),
    );
    expect(body).toEqual({
      status: 400,
      name: ErrorCode.INVALID_REFERENCE,
      message: 'The selected level does not belong to the selected board',
      info: { constraint: 'courses_level_id_board_id_fkey' },
    });
  });

  it('maps P2002 to 409 and P2025 to 404', () => {
    expect(
      toErrorBody(prismaError('P2002', { constraint: { index: 'users_email_key' } })),
    ).toMatchObject({ status: 409, name: ErrorCode.CONFLICT });
    expect(toErrorBody(prismaError('P2025', {}))).toMatchObject({
      status: 404,
      name: ErrorCode.NOT_FOUND,
    });
  });

  it('maps a check-constraint violation (23514) to 409 with the constraint name', () => {
    const body = toErrorBody(
      prismaError('P2039', {
        originalCode: '23514',
        originalMessage:
          'new row for relation "courses" violates check constraint "courses_publish_guard"',
      }),
    );
    expect(body).toMatchObject({
      status: 409,
      name: ErrorCode.CONSTRAINT_VIOLATION,
      info: { constraint: 'courses_publish_guard' },
    });
  });

  it('never leaks raw Prisma messages for unknown codes', () => {
    const body = toErrorBody(prismaError('P1001', {}));
    expect(body).toMatchObject({ status: 500, name: ErrorCode.INTERNAL });
    expect(body.message).not.toContain('prisma');
  });

  it('maps unmapped domain error codes to 422', () => {
    expect(toErrorBody(new SampleDomainError('nope'))).toMatchObject({
      status: 422,
      name: 'SOMETHING_DOMAIN_SPECIFIC',
      message: 'nope',
    });
  });

  it('maps Nest 404s to ROUTE_NOT_FOUND and unknown errors to 500', () => {
    expect(toErrorBody(new NotFoundException())).toMatchObject({ status: 404 });
    expect(toErrorBody(new Error('boom'))).toMatchObject({
      status: 500,
      message: 'Internal server error',
    });
  });
});
