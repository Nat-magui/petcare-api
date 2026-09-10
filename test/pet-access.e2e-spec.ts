import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PetAccessRole } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface TestSession {
  accessToken: string;
  email: string;
  userId: string;
}

describe('PetAccess management (e2e)', () => {
  let app: INestApplication;
  let config: ConfigService;
  let jwt: JwtService;
  let prisma: PrismaService;

  const runId = randomUUID().slice(0, 8);
  const emailPrefix = `task012-${runId}`;
  const petNamePrefix = `task012-${runId}`;

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
    await prisma.pet.deleteMany({
      where: { name: { startsWith: petNamePrefix } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const createEmail = (label: string) =>
    `${emailPrefix}-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const createPetName = (label: string) =>
    `${petNamePrefix}-${label}-${randomUUID().slice(0, 8)}`;

  async function createSession(label: string): Promise<TestSession> {
    const email = createEmail(label).toLowerCase();
    const user = await prisma.user.create({
      data: {
        name: `User ${label}`,
        email,
        passwordHash: 'test-only-password-hash',
      },
      select: { id: true },
    });
    const accessToken = await jwt.signAsync(
      { jti: randomUUID(), sub: user.id },
      {
        secret: config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    return { accessToken, email, userId: user.id };
  }

  async function createPet(
    owner: TestSession,
    label: string,
  ): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: createPetName(label),
        species: 'DOG',
        careMode: 'FAMILY',
      })
      .expect(201);

    return { id: response.body.id as string };
  }

  async function seedAccess(
    petId: string,
    session: TestSession,
    role: PetAccessRole,
  ): Promise<void> {
    await prisma.petAccess.create({
      data: { petId, userId: session.userId, role },
    });
  }

  describe('GET /pets/:petId/access', () => {
    it('lets OWNER list exact safe PetAccess responses', async () => {
      const owner = await createSession('list-owner');
      const caregiver = await createSession('list-caregiver');
      const pet = await createPet(owner, 'list');
      await seedAccess(pet.id, caregiver, PetAccessRole.CAREGIVER);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${pet.id}/access`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      for (const access of response.body as Record<string, unknown>[]) {
        expect(Object.keys(access).sort()).toEqual([
          'createdAt',
          'email',
          'name',
          'role',
          'userId',
        ]);
      }
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: owner.userId,
            email: owner.email,
            role: 'OWNER',
          }),
          expect.objectContaining({
            userId: caregiver.userId,
            email: caregiver.email,
            role: 'CAREGIVER',
          }),
        ]),
      );
    });

    it.each([PetAccessRole.CAREGIVER, PetAccessRole.VIEWER])(
      'rejects requester role %s with PET_ROLE_FORBIDDEN',
      async (role) => {
        const owner = await createSession(`list-${role}-owner`);
        const actor = await createSession(`list-${role}`);
        const pet = await createPet(owner, `list-${role}`);
        await seedAccess(pet.id, actor, role);

        const response = await request(app.getHttpServer())
          .get(`/api/v1/pets/${pet.id}/access`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(403);

        expect(response.body).toMatchObject({ code: 'PET_ROLE_FORBIDDEN' });
      },
    );

    it('rejects an outsider with PET_ACCESS_DENIED', async () => {
      const owner = await createSession('list-private-owner');
      const outsider = await createSession('list-outsider');
      const pet = await createPet(owner, 'list-private');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${pet.id}/access`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(403);

      expect(response.body).toMatchObject({ code: 'PET_ACCESS_DENIED' });
    });

    it('returns PET_NOT_FOUND for a nonexistent Pet', async () => {
      const owner = await createSession('list-missing');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${randomUUID()}/access`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);

      expect(response.body).toMatchObject({ code: 'PET_NOT_FOUND' });
    });

    it('returns INVALID_IDENTIFIER for a malformed petId', async () => {
      const owner = await createSession('list-invalid-id');

      const response = await request(app.getHttpServer())
        .get('/api/v1/pets/not-a-uuid/access')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_IDENTIFIER' });
    });
  });

  describe('POST /pets/:petId/access', () => {
    it.each([
      PetAccessRole.CAREGIVER,
      PetAccessRole.VIEWER,
      PetAccessRole.OWNER,
    ])('adds %s and grants immediate Pet visibility', async (role) => {
      const owner = await createSession(`add-${role}-owner`);
      const target = await createSession(`add-${role}`);
      const pet = await createPet(owner, `add-${role}`);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/pets/${pet.id}/access`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: target.email.toUpperCase(), role })
        .expect(201);

      expect(Object.keys(response.body).sort()).toEqual([
        'createdAt',
        'email',
        'name',
        'role',
        'userId',
      ]);
      expect(response.body).toMatchObject({
        userId: target.userId,
        email: target.email,
        role,
      });

      const list = await request(app.getHttpServer())
        .get('/api/v1/pets')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id: pet.id, myRole: role }),
      ]);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/pets/${pet.id}`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);
      expect(detail.body).toMatchObject({ id: pet.id, myRole: role });
    });

    it('returns USER_NOT_FOUND after OWNER authorization', async () => {
      const owner = await createSession('add-missing-owner');
      const pet = await createPet(owner, 'add-missing');

      const response = await request(app.getHttpServer())
        .post(`/api/v1/pets/${pet.id}/access`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: createEmail('does-not-exist'), role: 'VIEWER' })
        .expect(404);

      expect(response.body).toMatchObject({ code: 'USER_NOT_FOUND' });
    });

    it('returns PET_ACCESS_EXISTS for a duplicate', async () => {
      const owner = await createSession('add-duplicate-owner');
      const target = await createSession('add-duplicate');
      const pet = await createPet(owner, 'add-duplicate');
      await seedAccess(pet.id, target, PetAccessRole.VIEWER);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/pets/${pet.id}/access`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: target.email, role: 'CAREGIVER' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'PET_ACCESS_EXISTS' });
    });

    it.each([
      { body: { email: 'invalid', role: 'VIEWER' }, label: 'invalid email' },
      {
        body: { email: 'valid@example.com', role: 'ADMIN' },
        label: 'invalid role',
      },
      {
        body: { email: 'valid@example.com', role: 'VIEWER', invite: true },
        label: 'unknown field',
      },
    ])('rejects $label with VALIDATION_ERROR', async ({ body }) => {
      const owner = await createSession('add-invalid-owner');
      const pet = await createPet(owner, 'add-invalid');

      const response = await request(app.getHttpServer())
        .post(`/api/v1/pets/${pet.id}/access`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.each([
      PetAccessRole.CAREGIVER,
      PetAccessRole.VIEWER,
      null,
    ])('does not reveal target existence to requester role %s', async (role) => {
      const owner = await createSession(`add-private-${role}-owner`);
      const actor = await createSession(`add-private-${role}-actor`);
      const target = await createSession(`add-private-${role}-target`);
      const pet = await createPet(owner, `add-private-${role}`);
      if (role) await seedAccess(pet.id, actor, role);
      const expectedCode = role
        ? 'PET_ROLE_FORBIDDEN'
        : 'PET_ACCESS_DENIED';

      for (const email of [target.email, createEmail('hidden-missing')]) {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/pets/${pet.id}/access`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .send({ email, role: 'VIEWER' })
          .expect(403);

        expect(response.body).toMatchObject({ code: expectedCode });
      }
    });
  });

  describe('PATCH /pets/:petId/access/:userId', () => {
    it('changes CAREGIVER to VIEWER and updates myRole immediately', async () => {
      const owner = await createSession('change-owner');
      const target = await createSession('change-caregiver');
      const pet = await createPet(owner, 'change-caregiver');
      await seedAccess(pet.id, target, PetAccessRole.CAREGIVER);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${pet.id}/access/${target.userId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ role: 'VIEWER' })
        .expect(200);

      expect(response.body).toMatchObject({
        userId: target.userId,
        role: 'VIEWER',
      });
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/pets/${pet.id}`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);
      expect(detail.body).toMatchObject({ myRole: 'VIEWER' });
    });

    it('promotes VIEWER to OWNER', async () => {
      const owner = await createSession('promote-owner');
      const target = await createSession('promote-viewer');
      const pet = await createPet(owner, 'promote-viewer');
      await seedAccess(pet.id, target, PetAccessRole.VIEWER);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${pet.id}/access/${target.userId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ role: 'OWNER' })
        .expect(200);

      expect(response.body).toMatchObject({ role: 'OWNER' });
    });

    it('returns PET_ACCESS_NOT_FOUND for a missing target access', async () => {
      const owner = await createSession('change-missing-owner');
      const pet = await createPet(owner, 'change-missing');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${pet.id}/access/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ role: 'VIEWER' })
        .expect(404);

      expect(response.body).toMatchObject({ code: 'PET_ACCESS_NOT_FOUND' });
    });

    it('returns INVALID_IDENTIFIER for a malformed target userId', async () => {
      const owner = await createSession('change-invalid-id-owner');
      const pet = await createPet(owner, 'change-invalid-id');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${pet.id}/access/not-a-uuid`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ role: 'VIEWER' })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_IDENTIFIER' });
    });

    it.each([{ role: 'ADMIN' }, { role: null }, { role: 'VIEWER', extra: 1 }])(
      'rejects invalid body %# with VALIDATION_ERROR',
      async (body) => {
        const owner = await createSession('change-invalid-owner');
        const pet = await createPet(owner, 'change-invalid');

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/pets/${pet.id}/access/${randomUUID()}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send(body)
          .expect(400);

        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      },
    );

    it.each([PetAccessRole.CAREGIVER, PetAccessRole.VIEWER, null])(
      'rejects requester role %s before target lookup',
      async (role) => {
        const owner = await createSession(`change-private-${role}-owner`);
        const actor = await createSession(`change-private-${role}`);
        const pet = await createPet(owner, `change-private-${role}`);
        if (role) await seedAccess(pet.id, actor, role);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/pets/${pet.id}/access/${randomUUID()}`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .send({ role: 'VIEWER' })
          .expect(403);

        expect(response.body).toMatchObject({
          code: role ? 'PET_ROLE_FORBIDDEN' : 'PET_ACCESS_DENIED',
        });
      },
    );

    it.each([PetAccessRole.CAREGIVER, PetAccessRole.VIEWER])(
      'rejects last OWNER demotion to %s without changing state',
      async (role) => {
        const owner = await createSession(`last-owner-${role}`);
        const pet = await createPet(owner, `last-owner-${role}`);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/pets/${pet.id}/access/${owner.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ role })
          .expect(409);

        expect(response.body).toMatchObject({ code: 'PET_LAST_OWNER' });
        const access = await prisma.petAccess.findUniqueOrThrow({
          where: {
            userId_petId: { userId: owner.userId, petId: pet.id },
          },
        });
        expect(access.role).toBe(PetAccessRole.OWNER);
      },
    );

    it('allows self-demotion when another OWNER remains', async () => {
      const ownerA = await createSession('self-demote-a');
      const ownerB = await createSession('self-demote-b');
      const pet = await createPet(ownerA, 'self-demote');
      await seedAccess(pet.id, ownerB, PetAccessRole.OWNER);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${pet.id}/access/${ownerA.userId}`)
        .set('Authorization', `Bearer ${ownerA.accessToken}`)
        .send({ role: 'CAREGIVER' })
        .expect(200);

      expect(response.body).toMatchObject({ role: 'CAREGIVER' });
      await expect(
        prisma.petAccess.count({
          where: { petId: pet.id, role: PetAccessRole.OWNER },
        }),
      ).resolves.toBe(1);
    });
  });

  describe('DELETE /pets/:petId/access/:userId', () => {
    it('removes CAREGIVER with 204 and revokes Pet visibility', async () => {
      const owner = await createSession('remove-owner');
      const target = await createSession('remove-caregiver');
      const pet = await createPet(owner, 'remove-caregiver');
      await seedAccess(pet.id, target, PetAccessRole.CAREGIVER);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${pet.id}/access/${target.userId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);

      expect(response.text).toBe('');
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/pets/${pet.id}`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
      expect(detail.body).toMatchObject({ code: 'PET_ACCESS_DENIED' });
    });

    it('returns PET_ACCESS_NOT_FOUND for a missing target access', async () => {
      const owner = await createSession('remove-missing-owner');
      const pet = await createPet(owner, 'remove-missing');

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${pet.id}/access/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);

      expect(response.body).toMatchObject({ code: 'PET_ACCESS_NOT_FOUND' });
    });

    it.each([PetAccessRole.CAREGIVER, PetAccessRole.VIEWER, null])(
      'rejects requester role %s before target lookup',
      async (role) => {
        const owner = await createSession(`remove-private-${role}-owner`);
        const actor = await createSession(`remove-private-${role}`);
        const pet = await createPet(owner, `remove-private-${role}`);
        if (role) await seedAccess(pet.id, actor, role);

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/pets/${pet.id}/access/${randomUUID()}`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(403);

        expect(response.body).toMatchObject({
          code: role ? 'PET_ROLE_FORBIDDEN' : 'PET_ACCESS_DENIED',
        });
      },
    );

    it('rejects deleting the last OWNER without changing state', async () => {
      const owner = await createSession('remove-last-owner');
      const pet = await createPet(owner, 'remove-last-owner');

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${pet.id}/access/${owner.userId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(409);

      expect(response.body).toMatchObject({ code: 'PET_LAST_OWNER' });
      await expect(
        prisma.petAccess.count({
          where: { petId: pet.id, role: PetAccessRole.OWNER },
        }),
      ).resolves.toBe(1);
    });

    it('allows an OWNER to remove self when another OWNER remains', async () => {
      const ownerA = await createSession('self-remove-a');
      const ownerB = await createSession('self-remove-b');
      const pet = await createPet(ownerA, 'self-remove');
      await seedAccess(pet.id, ownerB, PetAccessRole.OWNER);

      await request(app.getHttpServer())
        .delete(`/api/v1/pets/${pet.id}/access/${ownerA.userId}`)
        .set('Authorization', `Bearer ${ownerA.accessToken}`)
        .expect(204);

      await expect(
        prisma.petAccess.count({
          where: { petId: pet.id, role: PetAccessRole.OWNER },
        }),
      ).resolves.toBe(1);
      await request(app.getHttpServer())
        .get(`/api/v1/pets/${pet.id}`)
        .set('Authorization', `Bearer ${ownerA.accessToken}`)
        .expect(403);
    });
  });

  it(
    'concurrent owner demotions cannot leave a Pet without an OWNER',
    async () => {
      const ownerA = await createSession('concurrent-a');
      const ownerB = await createSession('concurrent-b');
      const pet = await createPet(ownerA, 'concurrent');
      await seedAccess(pet.id, ownerB, PetAccessRole.OWNER);

      const results = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/pets/${pet.id}/access/${ownerA.userId}`)
          .set('Authorization', `Bearer ${ownerA.accessToken}`)
          .send({ role: 'CAREGIVER' }),
        request(app.getHttpServer())
          .patch(`/api/v1/pets/${pet.id}/access/${ownerB.userId}`)
          .set('Authorization', `Bearer ${ownerB.accessToken}`)
          .send({ role: 'VIEWER' }),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
      await expect(
        prisma.petAccess.count({
          where: { petId: pet.id, role: PetAccessRole.OWNER },
        }),
      ).resolves.toBe(1);
    },
    15_000,
  );
});
