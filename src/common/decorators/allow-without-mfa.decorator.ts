import { Reflector } from '@nestjs/core';

/**
 * Lets an admin whose session has not passed MFA reach this route (#16): enrolment and the
 * endpoints needed to get there. Everything else returns 403 MFA_REQUIRED for such sessions.
 */
export const AllowWithoutMfa = Reflector.createDecorator<true>({ transform: () => true });
