import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';

/**
 * Restricts a route to callers holding at least one of the given roles.
 * Without @Roles, any authenticated user may call the route.
 */
export const Roles = Reflector.createDecorator<Role[]>();
