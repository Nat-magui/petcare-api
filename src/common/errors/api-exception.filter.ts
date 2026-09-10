import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorResponse } from './api-error.js';
import { ERROR_CODE } from './error-code.js';
import { ERROR_MESSAGE } from './error-messages.js';

interface HttpResponse {
  status(statusCode: number): HttpResponse;
  json(body: ApiErrorResponse): void;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const response = value as Partial<ApiErrorResponse>;

  return (
    typeof response.statusCode === 'number' &&
    typeof response.code === 'string' &&
    typeof response.error === 'string' &&
    (typeof response.message === 'string' || Array.isArray(response.message))
  );
}

function getFrameworkErrorLabel(
  exceptionResponse: string | object,
  statusCode: number,
): string {
  if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
    const error = (exceptionResponse as { error?: unknown }).error;

    if (typeof error === 'string') {
      return error;
    }
  }

  return STATUS_CODES[statusCode] ?? 'Error';
}

function getFrameworkErrorMessage(
  exceptionResponse: string | object,
  fallback: string,
): string | string[] {
  if (typeof exceptionResponse === 'string') {
    return exceptionResponse;
  }

  const message = (exceptionResponse as { message?: unknown }).message;

  if (typeof message === 'string') {
    return message;
  }

  if (
    Array.isArray(message) &&
    message.every((item): item is string => typeof item === 'string')
  ) {
    return message;
  }

  return fallback;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();

    if (exception instanceof HttpException) {
      if (exception.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        response.status(HttpStatus.TOO_MANY_REQUESTS).json({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
          error: 'Too Many Requests',
          message: ERROR_MESSAGE.RATE_LIMIT_EXCEEDED,
        });
        return;
      }

      const exceptionResponse = exception.getResponse();

      if (isApiErrorResponse(exceptionResponse)) {
        response.status(exception.getStatus()).json(exceptionResponse);
        return;
      }

      const statusCode = exception.getStatus();
      response.status(statusCode).json({
        statusCode,
        code: ERROR_CODE.HTTP_ERROR,
        error: getFrameworkErrorLabel(exceptionResponse, statusCode),
        message: getFrameworkErrorMessage(
          exceptionResponse,
          exception.message,
        ),
      });
      return;
    }

    this.logUnexpectedException(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODE.INTERNAL_ERROR,
      error: 'Internal Server Error',
      message: ERROR_MESSAGE.INTERNAL_ERROR,
    });
  }

  private logUnexpectedException(exception: unknown): void {
    if (exception instanceof Error) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`Unhandled ${exception.name}`);
        return;
      }

      const stackFrames = exception.stack?.split('\n').slice(1).join('\n');
      this.logger.error(`Unhandled ${exception.name}`, stackFrames);
      return;
    }

    this.logger.error('Unhandled non-Error exception');
  }
}
