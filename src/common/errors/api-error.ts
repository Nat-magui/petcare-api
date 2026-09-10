import type { ErrorCode } from './error-code.js';

export interface ApiErrorResponse {
  statusCode: number;
  code: ErrorCode;
  error: string;
  message: string | string[];
  details?: ValidationErrorDetail[] | null;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
}
