import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const RAW_RESPONSE = Symbol.for('sprout:raw-response');

export interface Paginated<T> {
  items: T[];
  meta: Record<string, unknown>;
}

function isPaginated(value: unknown): value is Paginated<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Paginated<unknown>).items) &&
    typeof (value as Paginated<unknown>).meta === 'object'
  );
}

/**
 * §6.1 — wraps every successful body in { data, meta }. Handlers that stream
 * (SSE) or write to the reply directly opt out with @RawResponse().
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    if (Reflect.getMetadata(RAW_RESPONSE, handler)) return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        if (body === undefined || body === null) return { data: null };
        if (typeof body === 'object' && 'data' in (body as Record<string, unknown>)) return body;
        if (isPaginated(body)) return { data: body.items, meta: body.meta };
        return { data: body };
      }),
    );
  }
}

/** Marks a handler that manages its own response body (SSE, redirects, files). */
export const RawResponse = (): MethodDecorator => (_target, _key, descriptor) => {
  Reflect.defineMetadata(RAW_RESPONSE, true, descriptor.value as object);
  return descriptor;
};
