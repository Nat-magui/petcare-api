import { STATUS_CODES } from 'node:http';
import { HttpException } from '@nestjs/common';
import type { ApiErrorResponse } from './api-error.js';
import type { ErrorCode } from './error-code.js';

export interface AppExceptionOptions {
  statusCode: number;
  code: ErrorCode;
  message: string | string[];
  details?: unknown;
}

export class AppException extends HttpException {
  constructor({ statusCode, code, message, details }: AppExceptionOptions) {
    const response: ApiErrorResponse = {
      statusCode,
      code,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      ...(details === undefined ? {} : { details }),
    };

    super(response, statusCode);
  }
}
