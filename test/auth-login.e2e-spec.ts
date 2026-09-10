import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { compare } from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auth login (e2e)', () => {
  let app: INestApplication;
  let config: ConfigService;
  let jwt: JwtService;
  let prisma: PrismaService;

  const emailPrefix = `task007-${randomUUID().slice(0, 8)}`;

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

  async function registerUser(email: string, password = 'secure-password') {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Maga Ruiz', email, password })
      .expect(201);
  }

  it('logs in with a normalized email and returns valid access/refresh JWTs with no hashes', async () => {
    const email = createEmail();
    const password = 'secure-password';
    await registerUser(email, password);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: email.toUpperCase(), password })
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'accessToken',
      'refreshToken',
      'user',
    ]);
    expect(response.body.user).toMatchObject({
      name: 'Maga Ruiz',
      email,
    });
    expect(Object.keys(response.body.user).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
    ]);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('refreshTokenHash');
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.user).not.toHaveProperty('refreshTokenHash');

    const accessPayload = await jwt.verifyAsync(response.body.accessToken, {
      secret: config.getOrThrow<string>('JWT_SECRET'),
    });
    const refreshPayload = await jwt.verifyAsync(response.body.refreshToken, {
      secret: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });

    expect(accessPayload).toMatchObject({
      sub: response.body.user.id,
      jti: expect.any(String),
    });
    expect(refreshPayload).toMatchObject({
      sub: response.body.user.id,
      jti: expect.any(String),
    });
    expect(accessPayload.exp - accessPayload.iat).toBe(15 * 60);
    expect(refreshPayload.exp - refreshPayload.iat).toBe(7 * 24 * 60 * 60);
  });

  it('returns an identical AUTH_INVALID_CREDENTIALS response for nonexistent email and wrong password', async () => {
    const email = createEmail();
    await registerUser(email);

    const nonexistentResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: createEmail(), password: 'secure-password' })
      .expect(401);
    const wrongPasswordResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    const expectedError = {
      statusCode: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      error: 'Unauthorized',
      message: 'Las credenciales ingresadas no son válidas.',
    };
    expect(nonexistentResponse.body).toEqual(expectedError);
    expect(wrongPasswordResponse.body).toEqual(expectedError);
  });

  it('stores only a bcrypt refresh hash and replaces it on the next login', async () => {
    const email = createEmail();
    await registerUser(email);

    const firstLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'secure-password' })
      .expect(200);
    const firstStoredUser = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { refreshTokenHash: true },
    });

    expect(firstStoredUser.refreshTokenHash).not.toBe(
      firstLogin.body.refreshToken,
    );
    expect(firstStoredUser.refreshTokenHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(
      compare(firstLogin.body.refreshToken, firstStoredUser.refreshTokenHash!),
    ).resolves.toBe(true);

    const secondLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'secure-password' })
      .expect(200);
    const secondStoredUser = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true, refreshTokenHash: true },
    });

    expect(secondLogin.body.refreshToken).not.toBe(
      firstLogin.body.refreshToken,
    );
    expect(secondStoredUser.refreshTokenHash).not.toBe(
      firstStoredUser.refreshTokenHash,
    );
    await expect(
      compare(secondLogin.body.refreshToken, secondStoredUser.refreshTokenHash!),
    ).resolves.toBe(true);
    await expect(
      compare(firstLogin.body.refreshToken, secondStoredUser.refreshTokenHash!),
    ).resolves.toBe(false);
    expect(secondLogin.body.user).not.toHaveProperty('passwordHash');
    expect(secondLogin.body.user).not.toHaveProperty('refreshTokenHash');
  });
});
