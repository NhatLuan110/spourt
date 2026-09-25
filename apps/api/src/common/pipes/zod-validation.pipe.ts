import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppException } from '../exceptions/app.exception';

/**
 * §11 — the single place request payloads are validated. The same Zod schemas
 * are shared with the web app so client and server always agree.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw AppException.validation(
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      );
    }
    return result.data;
  }
}

export function zodPipe<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
