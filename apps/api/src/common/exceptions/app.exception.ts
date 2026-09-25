import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, ERROR_MESSAGE_VI } from '@sprout/shared';
import type { ErrorCode } from '@sprout/shared';

/**
 * §6.1 — the only error type services should throw. The global filter turns it
 * into the { error: { code, message, details } } envelope.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    message?: string,
    readonly details?: unknown,
  ) {
    super({ code, message: message ?? ERROR_MESSAGE_VI[code], details }, status);
  }

  static notFound(what = 'Nội dung', details?: unknown): AppException {
    return new AppException(
      ERROR_CODES.NOT_FOUND,
      HttpStatus.NOT_FOUND,
      `${what} không tồn tại.`,
      details,
    );
  }

  static unauthenticated(message?: string): AppException {
    return new AppException(ERROR_CODES.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED, message);
  }

  static forbidden(message?: string): AppException {
    return new AppException(ERROR_CODES.FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }

  static validation(details: unknown, message?: string): AppException {
    return new AppException(
      ERROR_CODES.VALIDATION_FAILED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      details,
    );
  }

  static conflict(code: ErrorCode, message?: string, details?: unknown): AppException {
    return new AppException(code, HttpStatus.CONFLICT, message, details);
  }
}
