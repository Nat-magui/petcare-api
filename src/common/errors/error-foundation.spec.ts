import type { ArgumentMetadata, ArgumentsHost } from '@nestjs/common';
import { HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter.js';
import type { ApiErrorResponse } from './api-error.js';
import { AppException } from './app.exception.js';
import { ERROR_CODE } from './error-code.js';
import { ERROR_MESSAGE } from './error-messages.js';
import { AppParseUUIDPipe } from '../pipes/app-parse-uuid.pipe.js';
import { createValidationPipe } from '../pipes/validation.pipe.js';

class TestDto {
  @IsString()
  @MinLength(2)
  name: string;
}

const bodyMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: TestDto,
};

async function captureException(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return error as AppException;
  }

  throw new Error('Expected the operation to throw');
}

function createHttpHost() {
  const json = vi.fn<(body: ApiErrorResponse) => void>();
  const response = {
    status: vi.fn<(statusCode: number) => unknown>(),
    json,
  };
  response.status.mockImplementation(() => response);

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status: response.status };
}

describe('API error foundation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unknown DTO properties with validation details', async () => {
    const exception = await captureException(
      createValidationPipe().transform(
        { name: 'Milo', isAdmin: true },
        bodyMetadata,
      ),
    );

    expect(exception.getResponse()).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODE.VALIDATION_ERROR,
      error: 'Bad Request',
      message: ERROR_MESSAGE.VALIDATION_ERROR,
      details: [
        {
          field: 'isAdmin',
          message: 'property isAdmin should not exist',
        },
      ],
    });
  });

  it('returns field-level details for invalid DTO values', async () => {
    const exception = await captureException(
      createValidationPipe().transform({ name: 1 }, bodyMetadata),
    );
    const response = exception.getResponse() as ApiErrorResponse;

    expect(response).toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODE.VALIDATION_ERROR,
      error: 'Bad Request',
      message: ERROR_MESSAGE.VALIDATION_ERROR,
    });
    expect(response.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
      ]),
    );
  });

  it('transforms valid payloads into DTO instances', async () => {
    const result = await createValidationPipe().transform(
      { name: 'Milo' },
      bodyMetadata,
    );

    expect(result).toBeInstanceOf(TestDto);
  });

  it('maps malformed UUIDs to INVALID_IDENTIFIER', async () => {
    const exception = await captureException(
      new AppParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        data: 'petId',
      }),
    );

    expect(exception.getResponse()).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODE.INVALID_IDENTIFIER,
      error: 'Bad Request',
      message: ERROR_MESSAGE.INVALID_IDENTIFIER,
    });
  });

  it('normalizes framework HTTP exceptions with HTTP_ERROR', () => {
    const { host, json, status } = createHttpHost();

    new ApiExceptionFilter().catch(
      new NotFoundException('Cannot GET /api/v1/no-existe'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      code: ERROR_CODE.HTTP_ERROR,
      error: 'Not Found',
      message: 'Cannot GET /api/v1/no-existe',
    });
  });

  it('preserves specific AppException codes', () => {
    const { host, json, status } = createHttpHost();
    const exception = new AppException({
      statusCode: HttpStatus.NOT_FOUND,
      code: ERROR_CODE.PET_NOT_FOUND,
      message: 'No se encontró la mascota solicitada.',
    });

    new ApiExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
  });

  it('does not leak unhandled error details in API responses', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, json, status } = createHttpHost();

    new ApiExceptionFilter().catch(
      new Error('DATABASE_URL=postgresql://secret'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODE.INTERNAL_ERROR,
      error: 'Internal Server Error',
      message: ERROR_MESSAGE.INTERNAL_ERROR,
    });

    const serializedResponse = JSON.stringify(json.mock.calls[0]?.[0]);
    expect(serializedResponse).not.toContain('DATABASE_URL');
    expect(serializedResponse).not.toContain('secret');
    expect(serializedResponse).not.toContain('stack');
  });
});
