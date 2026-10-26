/**
 * Every error the API can return. `name` in the error response is the enum value.
 * Add a code here rather than throwing a bare HttpException from a service.
 */
export enum ErrorCode {
  // Generic
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INVALID_REFERENCE = 'INVALID_REFERENCE',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  UPLOAD_REJECTED = 'UPLOAD_REJECTED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL = 'INTERNAL',

  // Auth
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',

  // Courses
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  PUBLISH_GUARD_FAILED = 'PUBLISH_GUARD_FAILED',
  COURSE_NOT_PRICEABLE = 'COURSE_NOT_PRICEABLE',
}

export interface ErrorDefinition {
  status: number;
  message: string;
}

export const ERROR_DEFINITIONS: Record<ErrorCode, ErrorDefinition> = {
  [ErrorCode.BAD_REQUEST]: { status: 400, message: 'Bad request' },
  [ErrorCode.VALIDATION_FAILED]: { status: 400, message: 'Request validation failed' },
  [ErrorCode.UNAUTHENTICATED]: { status: 401, message: 'Authentication required' },
  [ErrorCode.FORBIDDEN]: { status: 403, message: 'You do not have permission to do this' },
  [ErrorCode.NOT_FOUND]: { status: 404, message: 'Resource not found' },
  [ErrorCode.ROUTE_NOT_FOUND]: { status: 404, message: 'Route not found' },
  [ErrorCode.CONFLICT]: { status: 409, message: 'Resource already exists' },
  [ErrorCode.INVALID_REFERENCE]: { status: 400, message: 'A referenced record does not exist' },
  [ErrorCode.CONSTRAINT_VIOLATION]: { status: 409, message: 'The change violates a data rule' },
  [ErrorCode.PAYLOAD_TOO_LARGE]: { status: 413, message: 'Request body too large' },
  [ErrorCode.UPLOAD_REJECTED]: { status: 400, message: 'The uploaded file was not accepted' },
  [ErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service unavailable' },
  [ErrorCode.INTERNAL]: { status: 500, message: 'Internal server error' },
  [ErrorCode.INVALID_CREDENTIALS]: { status: 401, message: 'Invalid email or password' },
  [ErrorCode.INVALID_STATE_TRANSITION]: {
    status: 409,
    message: 'This action is not allowed in the current state',
  },
  [ErrorCode.PUBLISH_GUARD_FAILED]: {
    status: 422,
    message: 'A course must be free, or have both a price and a commission, before it is published',
  },
  [ErrorCode.COURSE_NOT_PRICEABLE]: {
    status: 409,
    message: 'Pricing can only be set while a course is awaiting approval',
  },
};

export function isErrorCode(value: string): value is ErrorCode {
  return value in ERROR_DEFINITIONS;
}
