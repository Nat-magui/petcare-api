import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService current user', () => {
  const userId = '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884';
  const publicUser = {
    id: userId,
    name: 'Maga',
    email: 'maga@example.com',
    createdAt: new Date('2026-09-10T12:00:00.000Z'),
  };

  let usersService: { findById: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    usersService = { findById: vi.fn() };
    service = new AuthService(
      usersService as unknown as UsersService,
      {} as JwtService,
      {} as ConfigService,
    );
  });

  it('returns the UsersService public projection', async () => {
    usersService.findById.mockResolvedValue(publicUser);

    await expect(service.getCurrentUser(userId)).resolves.toEqual(publicUser);
    expect(usersService.findById).toHaveBeenCalledWith(userId);
  });

  it('uses AUTH_ACCESS_REQUIRED when the token subject no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(service.getCurrentUser(userId)).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: ERROR_CODE.AUTH_ACCESS_REQUIRED,
        error: 'Unauthorized',
        message: ERROR_MESSAGE.AUTH_ACCESS_REQUIRED,
      },
    });
  });
});
