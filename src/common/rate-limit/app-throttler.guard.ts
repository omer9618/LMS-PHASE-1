import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';

/**
 * The library sends `Retry-After` only for its `default` bucket and `Retry-After-<name>` for the
 * others. Clients and proxies look for the plain header, so every 429 carries it.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse<Response>();
    if (!res.getHeader('Retry-After')) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil(detail.timeToBlockExpire)));
    }
    return super.throwThrottlingException(context, detail);
  }
}
