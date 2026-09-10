import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { compare } from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auth registration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailPrefix = `task006-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: emailPrefix,
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const createEmail = () =>
    `${emailPrefix}-${randomUUID().slice(0, 8)}@example.com`;

  it('registers a user, returns only public fields, and stores a bcrypt hash', async () => {
    const email = createEmail();
    const password = 'secure-password';

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Maga Ruiz',
        email: email.toUpperCase(),
        password,
      })
      .expect(201);

    expect(Object.keys(response.body).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
    ]);
    expect(response.body).toMatchObject({
      name: 'Maga Ruiz',
      email,
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('refreshTokenHash');

    const storedUser = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: {
        passwordHash: true,
        refreshTokenHash: true,
      },
    });

    expect(storedUser.passwordHash).not.toBe(password);
    expect(storedUser.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(compare(password, storedUser.passwordHash)).resolves.toBe(
      true,
    );
    expect(storedUser.refreshTokenHash).toBeNull();
  });

  it('rejects a case-insensitive duplicate email with AUTH_EMAIL_IN_USE', async () => {
    const email = createEmail();
    const registration = {
      name: 'Existing User',
      email,
      password: 'secure-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...registration,
        email: email.toUpperCase(),
      })
      .expect(409);

    expect(response.body).toEqual({
      statusCode: 409,
      code: 'AUTH_EMAIL_IN_USE',
      error: 'Conflict',
      message: 'El correo electrónico ya está registrado.',
    });
  });

  it.each([
    {
      caseName: 'an invalid email',
      body: () => ({
        name: 'Invalid Email',
        email: 'not-an-email',
        password: 'secure-password',
      }),
    },
    {
      caseName: 'a password shorter than 8 characters',
      body: () => ({
        name: 'Short Password',
        email: createEmail(),
        password: 'short',
      }),
    },
    {
      caseName: 'a password longer than 72 characters',
      body: () => ({
        name: 'Long Password',
        email: createEmail(),
        password: 'x'.repeat(73),
      }),
    },
    {
      caseName: 'an unknown property',
      body: () => ({
        name: 'Unknown Property',
        email: createEmail(),
        password: 'secure-password',
        isAdmin: true,
      }),
    },
  ])('rejects $caseName with the validation envelope', async ({ body, caseName }) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(body())
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      error: 'Bad Request',
      message: 'Los datos enviados no son válidos.',
    });
    if (caseName === 'an unknown property') {
      expect(response.body.details).toEqual([
        {
          field: 'isAdmin',
          message: "La propiedad 'isAdmin' no está permitida.",
        },
      ]);
    } else {
      expect(response.body.details).toEqual(expect.any(Array));
    }
  });
});
