import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { AppException } from '../common/errors/app.exception.js';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import { Prisma } from '../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import { toPublicUser, type PublicUser } from '../users/users.types.js';
import type { RefreshTokenPayload } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const BCRYPT_COST = 12;
const DEFAULT_ACCESS_TOKEN_EXPIRATION = '15m';
const DEFAULT_REFRESH_TOKEN_EXPIRATION = '7d';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user || !(await compare(loginDto.password, user.passwordHash))) {
      throw this.invalidCredentialsException();
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user.id),
      this.jwtService.signAsync(
        { jti: randomUUID(), sub: user.id },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.tokenExpiration(
            'JWT_REFRESH_EXPIRES_IN',
            DEFAULT_REFRESH_TOKEN_EXPIRATION,
          ),
        },
      ),
    ]);

    const refreshTokenHash = await hash(refreshToken, BCRYPT_COST);
    await this.usersService.updateRefreshTokenHash(user.id, refreshTokenHash);

    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }

  async refresh(refreshTokenDto: RefreshTokenDto): Promise<RefreshResponse> {
    const userId = await this.validateRefreshSession(
      refreshTokenDto.refreshToken,
    );

    return {
      accessToken: await this.signAccessToken(userId),
    };
  }

  async logout(refreshTokenDto: RefreshTokenDto): Promise<void> {
    const userId = await this.validateRefreshSession(
      refreshTokenDto.refreshToken,
    );

    await this.usersService.clearRefreshTokenHash(userId);
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new AppException({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: ERROR_CODE.AUTH_ACCESS_REQUIRED,
        message: ERROR_MESSAGE.AUTH_ACCESS_REQUIRED,
      });
    }

    return user;
  }

  private emailInUseException(): AppException {
    return new AppException({
      statusCode: HttpStatus.CONFLICT,
      code: ERROR_CODE.AUTH_EMAIL_IN_USE,
      message: ERROR_MESSAGE.AUTH_EMAIL_IN_USE,
    });
  }

  private invalidCredentialsException(): AppException {
    return new AppException({
      statusCode: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODE.AUTH_INVALID_CREDENTIALS,
      message: ERROR_MESSAGE.AUTH_INVALID_CREDENTIALS,
    });
  }

  private async validateRefreshSession(refreshToken: string): Promise<string> {
    const secret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret, algorithms: ['HS256'] },
      );
    } catch {
      throw this.invalidRefreshException();
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw this.invalidRefreshException();
    }

    const user = await this.usersService.findAuthById(payload.sub);

    if (!user?.refreshTokenHash) {
      throw this.invalidRefreshException();
    }

    let refreshTokenMatches = false;

    try {
      refreshTokenMatches = await compare(
        refreshToken,
        user.refreshTokenHash,
      );
    } catch {
      throw this.invalidRefreshException();
    }

    if (!refreshTokenMatches) {
      throw this.invalidRefreshException();
    }

    return user.id;
  }

  private signAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { jti: randomUUID(), sub: userId },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.tokenExpiration(
          'JWT_EXPIRES_IN',
          DEFAULT_ACCESS_TOKEN_EXPIRATION,
        ),
      },
    );
  }

  private invalidRefreshException(): AppException {
    return new AppException({
      statusCode: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODE.AUTH_REFRESH_INVALID,
      message: ERROR_MESSAGE.AUTH_REFRESH_INVALID,
    });
  }

  private tokenExpiration(
    key: string,
    defaultValue: string,
  ): JwtSignOptions['expiresIn'] {
    return this.configService.get<string>(
      key,
      defaultValue,
    ) as JwtSignOptions['expiresIn'];
  }
}
