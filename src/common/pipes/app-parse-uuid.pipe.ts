import { HttpStatus, Injectable, ParseUUIDPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception.js';
import { ERROR_CODE } from '../errors/error-code.js';
import { ERROR_MESSAGE } from '../errors/error-messages.js';

@Injectable()
export class AppParseUUIDPipe extends ParseUUIDPipe {
  constructor() {
    super({
      exceptionFactory: () =>
        new AppException({
          statusCode: HttpStatus.BAD_REQUEST,
          code: ERROR_CODE.INVALID_IDENTIFIER,
          message: ERROR_MESSAGE.INVALID_IDENTIFIER,
        }),
    });
  }
}
