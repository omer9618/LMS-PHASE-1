import { Reflector } from '@nestjs/core';

/**
 * A public route that still recognises a signed-in caller: AuthGuard attaches `req.user` when the
 * session cookie is valid and lets the request through either way. Use it where anonymous and
 * signed-in visitors get different answers (e.g. free-preview vs enrolled playback, #37).
 */
export const OptionalAuth = Reflector.createDecorator<true>({ transform: () => true });
