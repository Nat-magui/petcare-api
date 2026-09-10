import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

interface SecurityTestConfig {
  globalLimit: number;
  authLimit: number;
  corsOrigin: string;
}

describe('API security hardening (e2e)', () => {
  const originalEnvironment = {
    THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
    THROTTLE_TTL_MS: process.env.THROTTLE_TTL_MS,
    AUTH_THROTTLE_LIMIT: process.env.AUTH_THROTTLE_LIMIT,
    AUTH_THROTTLE_TTL_MS: process.env.AUTH_THROTTLE_TTL_MS,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  };

  async function createSecurityApp({
    globalLimit,
    authLimit,
    corsOrigin,
  }: SecurityTestConfig): Promise<INestApplication> {
    process.env.THROTTLE_LIMIT = String(globalLimit);
    process.env.THROTTLE_TTL_MS = '60000';
    process.env.AUTH_THROTTLE_LIMIT = String(authLimit);
    process.env.AUTH_THROTTLE_TTL_MS = '60000';
    process.env.CORS_ORIGIN = corsOrigin;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    configureApp(app, app.get(ConfigService));
    await app.init();

    return app;
  }

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('adds a stable Helmet header to normal responses', async () => {
    const app = await createSecurityApp({
      globalLimit: 20,
      authLimit: 5,
      corsOrigin: 'https://allowed.petcare.test',
    });

    try {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      await app.close();
    }
  });

  it('grants only the configured CORS origin and never uses wildcard', async () => {
    const allowedOrigin = 'https://allowed.petcare.test';
    const app = await createSecurityApp({
      globalLimit: 20,
      authLimit: 5,
      corsOrigin: allowedOrigin,
    });

    try {
      const allowed = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', allowedOrigin)
        .expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      );
      expect(allowed.headers['access-control-allow-origin']).not.toBe('*');

      const denied = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'https://unauthorized.test')
        .expect(200);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('enforces the global limit with the normalized PetCare 429 envelope', async () => {
    const app = await createSecurityApp({
      globalLimit: 2,
      authLimit: 1,
      corsOrigin: 'https://allowed.petcare.test',
    });

    try {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(429);

      expect(response.body).toEqual({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'Too Many Requests',
        message:
          'Se realizaron demasiadas solicitudes. Intentá nuevamente más tarde.',
      });
      expect(JSON.stringify(response.body)).not.toContain(
        'ThrottlerException',
      );
    } finally {
      await app.close();
    }
  });

  it('uses a stricter limit for register and login than the global limit', async () => {
    const app = await createSecurityApp({
      globalLimit: 4,
      authLimit: 2,
      corsOrigin: 'https://allowed.petcare.test',
    });

    try {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);
      const registerLimited = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(429);
      expect(registerLimited.body).toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
      const loginLimited = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(429);
      expect(loginLimited.body).toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
      });
    } finally {
      await app.close();
    }
  });
});
