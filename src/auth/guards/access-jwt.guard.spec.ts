import type { ExecutionContext } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODE } from '../../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../../common/errors/error-messages.js';
import { AccessJwtGuard } from './access-jwt.guard.js';

describe('AccessJwtGuard', () => {
  let request: { headers: { authorization?: string }; user?: unknown };
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };
  let guard: AccessJwtGuard;
  let context: ExecutionContext;

  beforeEach(() => {
    request = { headers: {} };
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    jwtService = { verifyAsync: vi.fn() };
    configService = {
      getOrThrow: vi.fn().mockReturnValue('access-secret'),
    };
    context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: vi.fn(),
        getNext: vi.fn(),
      }),
    } as unknown as ExecutionContext;
    guard = new AccessJwtGuard(
      reflector as unknown as Reflector,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('bypasses access validation only for explicitly public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(configService.getOrThrow).not.toHaveBeenCalled();
  });

  it('verifies an access token and attaches only the user id', async () => {
    request.headers.authorization = 'Bearer valid-access-token';
    jwtService.verifyAsync.mockResolvedValue({
      sub: '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884',
      jti: 'jwt-id',
      iat: 1,
      exp: 2,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-access-token', {
      secret: 'access-secret',
      algorithms: ['HS256'],
    });
    expect(request.user).toEqual({
      userId: '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884',
    });
  });

  it.each([
    ['a missing header', undefined],
    ['a missing token', 'Bearer'],
    ['the wrong scheme', 'Basic token'],
    ['extra authorization content', 'Bearer token extra'],
  ])('rejects %s with AUTH_ACCESS_REQUIRED', async (_case, authorization) => {
    request.headers.authorization = authorization;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: ERROR_CODE.AUTH_ACCESS_REQUIRED,
        error: 'Unauthorized',
        message: ERROR_MESSAGE.AUTH_ACCESS_REQUIRED,
      },
    });
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid verification', new Error('invalid signature')],
    ['expired verification', new Error('jwt expired')],
  ])('maps %s to AUTH_ACCESS_REQUIRED', async (_case, error) => {
    request.headers.authorization = 'Bearer rejected-token';
    jwtService.verifyAsync.mockRejectedValue(error);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: ERROR_CODE.AUTH_ACCESS_REQUIRED,
        error: 'Unauthorized',
        message: ERROR_MESSAGE.AUTH_ACCESS_REQUIRED,
      },
    });
  });

  it('rejects a verified token without a usable subject', async () => {
    request.headers.authorization = 'Bearer token-without-subject';
    jwtService.verifyAsync.mockResolvedValue({ jti: 'jwt-id' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: ERROR_CODE.AUTH_ACCESS_REQUIRED,
      },
    });
    expect(request.user).toBeUndefined();
  });
});
