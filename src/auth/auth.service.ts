import { HttpStatus, Injectable } from '@nestjs/common';
import { hash } from 'bcrypt';
import { AppException } from '../common/errors/app.exception.js';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import { Prisma } from '../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import type { PublicUser } from '../users/users.types.js';
import type { RegisterDto } from './dto/register.dto.js';

const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(registerDto: RegisterDto): Promise<PublicUser> {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw this.emailInUseException();
    }

    const passwordHash = await hash(registerDto.password, BCRYPT_COST);

    try {
      return await this.usersService.create({
        name: registerDto.name,
        email: registerDto.email,
        passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.emailInUseException();
      }

      throw error;
    }
  }

  private emailInUseException(): AppException {
    return new AppException({
      statusCode: HttpStatus.CONFLICT,
      code: ERROR_CODE.AUTH_EMAIL_IN_USE,
      message: ERROR_MESSAGE.AUTH_EMAIL_IN_USE,
    });
  }
}
