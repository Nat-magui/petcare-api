import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Access JWT and auth/me (e2e)', () => {
  let app: INestApplication;
  let config: ConfigService;
  let jwt: JwtService;
  let prisma: PrismaService;

  const emailPrefix = `task008-${randomUUID().slice(0, 8)}`;
  const password = 'secure-password';
  const accessRequiredError = {
    statusCode: 401,
    code: 'AUTH_ACCESS_REQUIRED',
    error: 'Unauthorized',
    message: 'Necesitás iniciar sesión para continuar.',
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

  it('rejects auth/me without Authorization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);

    expect(response.body).toEqual(accessRequiredError);
  });

  it('rejects a malformed Bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer')
      .expect(401);

    expect(response.body).toEqual(accessRequiredError);
  });

  it('rejects an invalid access token', async () => {
    const invalidToken = await jwt.signAsync(
      { sub: randomUUID() },
      { secret: 'not-the-access-secret', expiresIn: '15m' },
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${invalidToken}`)
      .expect(401);

    expect(response.body).toEqual(accessRequiredError);
  });

  it('rejects an expired access token', async () => {
    const expiredToken = await jwt.signAsync(
      { sub: randomUUID() },
      {
        secret: config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: -1,
      },
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body).toEqual(accessRequiredError);
  });

  it('does not accept a refresh token as Bearer authentication', async () => {
    const { login } = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.refreshToken}`)
      .expect(401);

    expect(response.body).toEqual(accessRequiredError);
  });

  it('returns only public user fields for a valid access token', async () => {
    const { email, login } = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      id: login.user.id,
      name: 'Maga Ruiz',
      email,
      createdAt: login.user.createdAt,
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
    ]);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('refreshTokenHash');
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('refreshToken');
  });

  it('rejects a valid access token whose user no longer exists', async () => {
    const { email, login } = await registerAndLogin();
    await prisma.user.delete({ where: { email } });

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(401);

    expect(response.body).toEqual(accessRequiredError);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('refreshTokenHash');
  });

  it('keeps health, register, and login explicitly public', async () => {
    const email = createEmail();

    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Public Route User', email, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
  });
});
