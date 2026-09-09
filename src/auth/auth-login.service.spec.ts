import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const { compareMock, hashMock } = vi.hoisted(() => ({
  compareMock: vi.fn(),
  hashMock: vi.fn(),
}));

vi.mock('bcrypt', () => ({ compare: compareMock, hash: hashMock }));

describe('AuthService login', () => {
  const loginDto = {
    email: 'MAGA@EXAMPLE.COM',
    password: 'password-segura',
  };
  const authUser = {
    id: '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884',
    name: 'Maga',
    email: 'maga@example.com',
    passwordHash: 'bcrypt-password-hash',
    refreshTokenHash: null,
    createdAt: new Date('2026-09-09T12:00:00.000Z'),
  };

  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateRefreshTokenHash: ReturnType<typeof vi.fn>;
  };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let configService: {
    getOrThrow: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: vi.fn(),
      create: vi.fn(),
      updateRefreshTokenHash: vi.fn(),
    };
    jwtService = { signAsync: vi.fn() };
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
    hashMock.mockReset();
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('returns access, refresh, and only the public user after persisting the refresh hash', async () => {
    usersService.findByEmail.mockResolvedValue(authUser);
    usersService.updateRefreshTokenHash.mockResolvedValue(undefined);
    compareMock.mockResolvedValue(true);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    hashMock.mockResolvedValue('bcrypt-refresh-hash');

    const response = await service.login(loginDto);

    expect(response).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        createdAt: authUser.createdAt,
      },
    });
    expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
    expect(compareMock).toHaveBeenCalledWith(
      loginDto.password,
      authUser.passwordHash,
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      { sub: authUser.id, jti: expect.any(String) },
      { secret: 'access-secret', expiresIn: '15m' },
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      { sub: authUser.id, jti: expect.any(String) },
      { secret: 'refresh-secret', expiresIn: '7d' },
    );
    expect(hashMock).toHaveBeenCalledWith('refresh-token', 12);
    expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
      authUser.id,
      'bcrypt-refresh-hash',
    );
    expect(response.user).not.toHaveProperty('passwordHash');
    expect(response.user).not.toHaveProperty('refreshTokenHash');
  });

  it.each([
    ['a nonexistent email', null, false],
    ['a wrong password', authUser, false],
  ])(
    'returns the same AUTH_INVALID_CREDENTIALS error for %s',
    async (_case, user, matches) => {
      usersService.findByEmail.mockResolvedValue(user);
      compareMock.mockResolvedValue(matches);

      await expect(service.login(loginDto)).rejects.toMatchObject({
        response: {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: ERROR_CODE.AUTH_INVALID_CREDENTIALS,
          error: 'Unauthorized',
          message: ERROR_MESSAGE.AUTH_INVALID_CREDENTIALS,
        },
      });
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(usersService.updateRefreshTokenHash).not.toHaveBeenCalled();
    },
  );

  it('replaces the stored refresh hash on every successful login', async () => {
    let refreshSequence = 0;
    usersService.findByEmail.mockResolvedValue(authUser);
    usersService.updateRefreshTokenHash.mockResolvedValue(undefined);
    compareMock.mockResolvedValue(true);
    jwtService.signAsync.mockImplementation(
      async (_payload: unknown, options: { secret: string }) => {
        if (options.secret === 'access-secret') return 'access-token';
        refreshSequence += 1;
        return `refresh-token-${refreshSequence}`;
      },
    );
    hashMock.mockImplementation(async (token: string) => `hash-of-${token}`);

    await service.login(loginDto);
    await service.login(loginDto);

    expect(usersService.updateRefreshTokenHash).toHaveBeenNthCalledWith(
      1,
      authUser.id,
      'hash-of-refresh-token-1',
    );
    expect(usersService.updateRefreshTokenHash).toHaveBeenNthCalledWith(
      2,
      authUser.id,
      'hash-of-refresh-token-2',
    );
  });
});
