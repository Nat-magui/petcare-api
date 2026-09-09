import { HttpStatus, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ValidationErrorDetail } from '../errors/api-error.js';
import { AppException } from '../errors/app.exception.js';
import { ERROR_CODE } from '../errors/error-code.js';
import { ERROR_MESSAGE } from '../errors/error-messages.js';

function collectValidationDetails(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] {
  return errors.flatMap((validationError) => {
    const field = parentPath
      ? `${parentPath}.${validationError.property}`
      : validationError.property;
    const details = Object.values(validationError.constraints ?? {}).map(
      (message) => ({ field, message }),
    );

    return [
      ...details,
      ...collectValidationDetails(validationError.children ?? [], field),
    ];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new AppException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ERROR_CODE.VALIDATION_ERROR,
        message: ERROR_MESSAGE.VALIDATION_ERROR,
        details: collectValidationDetails(errors),
      }),
  });
}
