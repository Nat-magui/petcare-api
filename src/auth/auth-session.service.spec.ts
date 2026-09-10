import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const { compareMock } = vi.hoisted(() => ({ compareMock: vi.fn() }));

vi.mock('bcrypt', () => ({ compare: compareMock, hash: vi.fn() }));

describe('AuthService refresh sessions', () => {
  const userId = '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884';
  const refreshTokenDto = { refreshToken: 'current-refresh-token' };
  const authUser = {
    id: userId,
    name: 'Maga',
    email: 'maga@example.com',
    passwordHash: 'password-hash',
    refreshTokenHash: 'refresh-token-hash',
    createdAt: new Date('2026-09-10T12:00:00.000Z'),
  };

  let usersService: {
    findAuthById: ReturnType<typeof vi.fn>;
    clearRefreshTokenHash: ReturnType<typeof vi.fn>;
    updateRefreshTokenHash: ReturnType<typeof vi.fn>;
  };
  let jwtService: {
    verifyAsync: ReturnType<typeof vi.fn>;
    signAsync: ReturnType<typeof vi.fn>;
  };
  let configService: {
    getOrThrow: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findAuthById: vi.fn(),
      clearRefreshTokenHash: vi.fn(),
      updateRefreshTokenHash: vi.fn(),
    };
    jwtService = {
      verifyAsync: vi.fn(),
      signAsync: vi.fn(),
    };
    configService = {
      getOrThrow: vi.fn((key: string) => {
        const secrets: Record<string, string> = {
          JWT_SECRET: 'access-secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
        };
        return secrets[key];
      }),
      get: vi.fn((_key: string, defaultValue: string) => defaultValue),
    };
    compareMock.mockReset();
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  function arrangeValidSession() {
    jwtService.verifyAsync.mockResolvedValue({ sub: userId });
    usersService.findAuthById.mockResolvedValue(authUser);
    compareMock.mockResolvedValue(true);
  }

  it('issues only a new access token without changing session state', async () => {
    arrangeValidSession();
    jwtService.signAsync.mockResolvedValue('new-access-token');

    await expect(service.refresh(refreshTokenDto)).resolves.toEqual({
      accessToken: 'new-access-token',
    });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      refreshTokenDto.refreshToken,
      { secret: 'refresh-secret', algorithms: ['HS256'] },
    );
    expect(usersService.findAuthById).toHaveBeenCalledWith(userId);
    expect(compareMock).toHaveBeenCalledWith(
      refreshTokenDto.refreshToken,
      authUser.refreshTokenHash,
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      { jti: expect.any(String), sub: userId },
      { secret: 'access-secret', expiresIn: '15m' },
    );
    expect(usersService.updateRefreshTokenHash).not.toHaveBeenCalled();
    expect(usersService.clearRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('clears the stored hash after validating logout', async () => {
    arrangeValidSession();
    usersService.clearRefreshTokenHash.mockResolvedValue(undefined);

    await expect(service.logout(refreshTokenDto)).resolves.toBeUndefined();
    expect(usersService.clearRefreshTokenHash).toHaveBeenCalledWith(userId);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['a malformed, invalid, or expired JWT', 'verify'],
    ['a token without a subject', 'subject'],
    ['a nonexistent user', 'user'],
    ['a null stored hash', 'hash'],
    ['a token that does not match the stored hash', 'mismatch'],
  ])(
    'maps %s to the same AUTH_REFRESH_INVALID response',
    async (_case, failure) => {
      if (failure === 'verify') {
        jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));
      } else {
        jwtService.verifyAsync.mockResolvedValue(
          failure === 'subject' ? {} : { sub: userId },
        );
      }

      if (failure === 'user') {
        usersService.findAuthById.mockResolvedValue(null);
      } else if (failure === 'hash') {
        usersService.findAuthById.mockResolvedValue({
          ...authUser,
          refreshTokenHash: null,
        });
      } else if (failure !== 'subject' && failure !== 'verify') {
        usersService.findAuthById.mockResolvedValue(authUser);
      }

      compareMock.mockResolvedValue(failure !== 'mismatch');

      await expect(service.refresh(refreshTokenDto)).rejects.toMatchObject({
        response: {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: ERROR_CODE.AUTH_REFRESH_INVALID,
          error: 'Unauthorized',
          message: ERROR_MESSAGE.AUTH_REFRESH_INVALID,
        },
      });
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(usersService.clearRefreshTokenHash).not.toHaveBeenCalled();
    },
  );

  it('does not clear session state when logout validation fails', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

    await expect(service.logout(refreshTokenDto)).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: ERROR_CODE.AUTH_REFRESH_INVALID,
      },
    });
    expect(usersService.clearRefreshTokenHash).not.toHaveBeenCalled();
  });
});
