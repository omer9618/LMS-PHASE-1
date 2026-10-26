import { Reflector } from '@nestjs/core';

/**
 * Opts a route (or a whole controller) out of the global AuthGuard.
 * Everything is authenticated by default; this is the only way to make a route public.
 */
export const Public = Reflector.createDecorator<true>({ transform: () => true });
