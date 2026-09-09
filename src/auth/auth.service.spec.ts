import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import { Prisma } from '../generated/prisma/client.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const { hashMock } = vi.hoisted(() => ({ hashMock: vi.fn() }));

vi.mock('bcrypt', () => ({ hash: hashMock }));

describe('AuthService registration', () => {
  const registerDto = {
    name: 'Maga',
    email: 'MAGA@EXAMPLE.COM',
    password: 'password-segura',
  };
  const publicUser = {
    id: '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884',
    name: 'Maga',
    email: 'maga@example.com',
    createdAt: new Date('2026-09-09T12:00:00.000Z'),
  };

  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: vi.fn(),
      create: vi.fn(),
    };
    hashMock.mockReset();
    hashMock.mockResolvedValue('bcrypt-password-hash');
    service = new AuthService(
      usersService as unknown as UsersService,
      {} as JwtService,
      {} as ConfigService,
    );
  });

  it('hashes with cost 12 and persists no plaintext password', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue(publicUser);

    await expect(service.register(registerDto)).resolves.toEqual(publicUser);
    expect(hashMock).toHaveBeenCalledWith(registerDto.password, 12);
    expect(usersService.create).toHaveBeenCalledWith({
      name: registerDto.name,
      email: registerDto.email,
      passwordHash: 'bcrypt-password-hash',
    });
    expect(usersService.create.mock.calls[0]?.[0]).not.toHaveProperty(
      'password',
    );
  });

  it('rejects an email found by the pre-check', async () => {
    usersService.findByEmail.mockResolvedValue({ id: publicUser.id });

    await expect(service.register(registerDto)).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.CONFLICT,
        code: ERROR_CODE.AUTH_EMAIL_IN_USE,
        error: 'Conflict',
        message: ERROR_MESSAGE.AUTH_EMAIL_IN_USE,
      },
    });
    expect(hashMock).not.toHaveBeenCalled();
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('maps a database unique race to AUTH_EMAIL_IN_USE', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { modelName: 'User', target: ['email'] },
      }),
    );

    await expect(service.register(registerDto)).rejects.toEqual(
      new AppException({
        statusCode: HttpStatus.CONFLICT,
        code: ERROR_CODE.AUTH_EMAIL_IN_USE,
        message: ERROR_MESSAGE.AUTH_EMAIL_IN_USE,
      }),
    );
  });

  it('does not convert unexpected persistence errors', async () => {
    const unexpectedError = new Error('unexpected');
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockRejectedValue(unexpectedError);

    await expect(service.register(registerDto)).rejects.toBe(unexpectedError);
  });
});
