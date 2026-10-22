import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

/** Wraps every controller return value as `{ success: true, data }`. Controllers return plain data. */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    return next
      .handle()
      .pipe(map((data) => ({ success: true as const, data: data ?? (null as T) })));
  }
}
