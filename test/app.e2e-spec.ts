import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('normalizes an unmatched route with HTTP_ERROR', () => {
    return request(app.getHttpServer())
      .get('/api/v1/no-existe')
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'HTTP_ERROR',
        error: 'Not Found',
        message: 'Cannot GET /api/v1/no-existe',
      });
  });

  it('resolves PrismaService', () => {
    expect(app.get(PrismaService)).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
