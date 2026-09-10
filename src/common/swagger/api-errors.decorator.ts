import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import type { ErrorCode } from '../errors/error-code.js';
import { ERROR_MESSAGE } from '../errors/error-messages.js';
import { ApiErrorDetailDto, ApiErrorResponseDto } from './api-response.dto.js';

type DocumentedErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500;
type DocumentedErrorCode = Extract<ErrorCode, keyof typeof ERROR_MESSAGE>;
type ErrorResponses = Partial<
  Record<DocumentedErrorStatus, readonly DocumentedErrorCode[]>
>;

const errorTitle: Record<DocumentedErrorStatus, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

export function ApiPetCareErrors(responses: ErrorResponses): MethodDecorator {
  const decorators = Object.entries(responses).map(([status, codes]) =>
    ApiResponse({
      status: Number(status),
      description: codes.join(' | '),
      schema: {
        allOf: [{ $ref: getSchemaPath(ApiErrorResponseDto) }],
        example: {
          statusCode: Number(status),
          code: codes[0],
          error: errorTitle[Number(status) as DocumentedErrorStatus],
          message: ERROR_MESSAGE[codes[0]],
          ...(codes[0] === 'VALIDATION_ERROR'
            ? {
                details: [
                  {
                    field: 'email',
                    message: 'El email debe tener un formato válido.',
                  },
                ],
              }
            : {}),
        },
        properties: {
          statusCode: {
            type: 'integer',
            enum: [Number(status)],
            example: Number(status),
          },
          code: {
            type: 'string',
            enum: [...codes],
            example: codes[0],
          },
          error: {
            type: 'string',
            example: errorTitle[Number(status) as DocumentedErrorStatus],
          },
          message: {
            type: 'string',
            example: ERROR_MESSAGE[codes[0]],
          },
        },
      },
    }),
  );

  return applyDecorators(
    ApiExtraModels(ApiErrorResponseDto, ApiErrorDetailDto),
    ...decorators,
  );
}
