import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auth refresh and logout (e2e)', () => {
  let app: INestApplication;
  let config: ConfigService;
  let jwt: JwtService;
  let prisma: PrismaService;

  const emailPrefix = `task009-${randomUUID().slice(0, 8)}`;
  const password = 'secure-password';
  const refreshInvalidError = {
    statusCode: 401,
    code: 'AUTH_REFRESH_INVALID',
    error: 'Unauthorized',
    message: 'La sesión ya no puede renovarse. Iniciá sesión nuevamente.',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    config = app.get(ConfigService);
    jwt = app.get(JwtService);
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const createEmail = () =>
    `${emailPrefix}-${randomUUID().slice(0, 8)}@example.com`;

  async function registerAndLogin() {
    const email = createEmail();
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Maga Ruiz', email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return { email, registration: registration.body, login: login.body };
  }

  it('reuses a valid refresh token without changing its stored hash', async () => {
    const { email, login } = await registerAndLogin();
    const storedBefore = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { refreshTokenHash: true },
    });

    const firstRefresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(200);
    const secondRefresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(200);

    expect(Object.keys(firstRefresh.body)).toEqual(['accessToken']);
    expect(Object.keys(secondRefresh.body)).toEqual(['accessToken']);
    expect(firstRefresh.body.accessToken).toEqual(expect.any(String));
    expect(secondRefresh.body.accessToken).toEqual(expect.any(String));
    expect(secondRefresh.body.accessToken).not.toBe(
      firstRefresh.body.accessToken,
    );
    await expect(
      jwt.verifyAsync(firstRefresh.body.accessToken, {
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    ).resolves.toMatchObject({ sub: login.user.id });

    const storedAfter = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { refreshTokenHash: true },
    });
    expect(storedAfter.refreshTokenHash).toBe(storedBefore.refreshTokenHash);
  });

  it('rejects a malformed refresh token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-jwt' })
      .expect(401);

    expect(response.body).toEqual(refreshInvalidError);
  });

  it('rejects an expired refresh token', async () => {
    const expiredToken = await jwt.signAsync(
      { sub: randomUUID() },
      {
        secret: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: -1,
      },
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: expiredToken })
      .expect(401);

    expect(response.body).toEqual(refreshInvalidError);
  });

  it('rejects an access token used as a refresh token', async () => {
    const { login } = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.accessToken })
      .expect(401);

    expect(response.body).toEqual(refreshInvalidError);
  });

  it('rejects a refresh token whose user no longer exists', async () => {
    const { email, login } = await registerAndLogin();
    await prisma.user.delete({ where: { email } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(401);

    expect(response.body).toEqual(refreshInvalidError);
  });

  it('rejects a refresh token when the stored hash is null', async () => {
    const { email, login } = await registerAndLogin();
    await prisma.user.update({
      where: { email },
      data: { refreshTokenHash: null },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(401);

    expect(response.body).toEqual(refreshInvalidError);
  });

  it('rejects the old refresh token after a second login', async () => {
    const { email, login: firstLogin } = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstLogin.refreshToken })
      .expect(401);

    expect(response.body).toEqual(refreshInvalidError);
  });

  it.each([
    ['a missing token', {}],
    ['an empty token', { refreshToken: '' }],
    ['a non-string token', { refreshToken: 123 }],
    [
      'an unknown property',
      { refreshToken: 'token', unexpectedProperty: true },
    ],
  ])('rejects %s with VALIDATION_ERROR', async (_case, body) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send(body)
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      error: 'Bad Request',
      message: 'Los datos enviados no son válidos.',
    });
  });

  it('logs out, clears the hash, revokes refresh, and preserves access', async () => {
    const { email, login } = await registerAndLogin();

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.refreshToken })
      .expect(204);

    expect(logout.text).toBe('');
    expect(logout.body).toEqual({});
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { email },
        select: { refreshTokenHash: true },
      }),
    ).resolves.toEqual({ refreshTokenHash: null });

    const revokedRefresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(401);
    expect(revokedRefresh.body).toEqual(refreshInvalidError);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ id: login.user.id, email });
    expect(me.body).not.toHaveProperty('passwordHash');
    expect(me.body).not.toHaveProperty('refreshTokenHash');
  });

  it('rejects an invalid refresh token on logout', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'not-a-jwt' })
      .expect(401);

    expect(response.body).toEqual(refreshInvalidError);
  });

  it('validates the logout request body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({})
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      error: 'Bad Request',
      message: 'Los datos enviados no son válidos.',
    });
  });

  it('keeps existing public and protected route behavior unchanged', async () => {
    const email = createEmail();

    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Regression User', email, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'AUTH_ACCESS_REQUIRED' });
      });
  });
});
