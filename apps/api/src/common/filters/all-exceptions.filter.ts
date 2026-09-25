import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ERROR_CODES, ERROR_MESSAGE_VI } from '@sprout/shared';
import type { FastifyReply } from 'fastify';
import { AppException } from '../exceptions/app.exception';

interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

/** §6.1 — every failure leaves the API in the same shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const reply = context.getResponse<FastifyReply>();

    const { status, payload } = this.describe(exception);

    if (status >= 500) {
      this.logger.error(
        `${payload.code}: ${payload.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    void reply.status(status).send({ error: payload });
  }

  private describe(exception: unknown): { status: number; payload: ErrorPayload } {
    if (exception instanceof AppException) {
      const response = exception.getResponse() as ErrorPayload;
      return { status: exception.getStatus(), payload: response };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);

      return {
        status,
        payload: {
          code: this.codeForStatus(status),
          message: Array.isArray(message) ? message.join(', ') : message,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: ERROR_MESSAGE_VI.INTERNAL_ERROR,
      },
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ERROR_CODES.VALIDATION_FAILED;
      default:
        return status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_FAILED;
    }
  }
}
