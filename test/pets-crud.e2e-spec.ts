import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import {
  PetAccessRole,
  type Pet,
} from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface TestSession {
  accessToken: string;
  userId: string;
}

describe('Pet CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = randomUUID().slice(0, 8);
  const emailPrefix = `task011-${runId}`;
  const petNamePrefix = `task011-${runId}`;
  const password = 'secure-password';

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

  async function registerAndLogin(label: string): Promise<TestSession> {
    const email = createEmail(label);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: `User ${label}`, email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return {
      accessToken: login.body.accessToken as string,
      userId: login.body.user.id as string,
    };
  }

  async function createPet(
    owner: TestSession,
    label: string,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: createPetName(label),
        species: 'DOG',
        breed: 'Mestiza',
        birthDate: '2023-04-12',
        careMode: 'FAMILY',
        rescueOrganizationName: 'Patitas',
        ...overrides,
      })
      .expect(201);

    return response.body as Record<string, unknown>;
  }

  async function addAccess(
    petId: string,
    session: TestSession,
    role: PetAccessRole,
  ): Promise<void> {
    await prisma.petAccess.create({
      data: { petId, userId: session.userId, role },
    });
  }

  async function findStoredPet(petId: string): Promise<Pet> {
    return prisma.pet.findUniqueOrThrow({ where: { id: petId } });
  }

  describe('GET /pets', () => {
    it(
      'returns only accessible pets with each current user role',
      async () => {
        const owner = await registerAndLogin('list-owner');
        const caregiver = await registerAndLogin('list-caregiver');
        const viewer = await registerAndLogin('list-viewer');
        const otherOwner = await registerAndLogin('list-other');
        const sharedPet = await createPet(owner, 'shared');
        const inaccessiblePet = await createPet(otherOwner, 'inaccessible');
        const sharedPetId = sharedPet.id as string;

        await addAccess(sharedPetId, caregiver, PetAccessRole.CAREGIVER);
        await addAccess(sharedPetId, viewer, PetAccessRole.VIEWER);

        for (const [session, expectedRole] of [
          [owner, PetAccessRole.OWNER],
          [caregiver, PetAccessRole.CAREGIVER],
          [viewer, PetAccessRole.VIEWER],
        ] as const) {
          const response = await request(app.getHttpServer())
            .get('/api/v1/pets')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .expect(200);

          expect(response.body).toHaveLength(1);
          expect(response.body[0]).toMatchObject({
            id: sharedPetId,
            myRole: expectedRole,
          });
          expect(response.body[0]).not.toHaveProperty('accesses');
          expect(response.body).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: inaccessiblePet.id }),
            ]),
          );
        }
      },
      15_000,
    );

    it('returns an empty array when the user has no PetAccess', async () => {
      const session = await registerAndLogin('empty-list');

      const response = await request(app.getHttpServer())
        .get('/api/v1/pets')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /pets/:petId', () => {
    it('allows OWNER, CAREGIVER and VIEWER with the correct myRole', async () => {
      const owner = await registerAndLogin('detail-owner');
      const caregiver = await registerAndLogin('detail-caregiver');
      const viewer = await registerAndLogin('detail-viewer');
      const pet = await createPet(owner, 'detail');
      const petId = pet.id as string;

      await addAccess(petId, caregiver, PetAccessRole.CAREGIVER);
      await addAccess(petId, viewer, PetAccessRole.VIEWER);

      for (const [session, expectedRole] of [
        [owner, PetAccessRole.OWNER],
        [caregiver, PetAccessRole.CAREGIVER],
        [viewer, PetAccessRole.VIEWER],
      ] as const) {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/pets/${petId}`)
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          id: petId,
          birthDate: '2023-04-12',
          myRole: expectedRole,
        });
        expect(response.body).not.toHaveProperty('accesses');
      }
    }, 15_000);

    it('returns PET_ACCESS_DENIED for an existing inaccessible Pet', async () => {
      const owner = await registerAndLogin('detail-private-owner');
      const outsider = await registerAndLogin('detail-outsider');
      const pet = await createPet(owner, 'detail-private');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${pet.id as string}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'PET_ACCESS_DENIED',
        error: 'Forbidden',
        message: 'No tenés acceso a esta mascota.',
      });
    });

    it('returns PET_NOT_FOUND for a nonexistent valid UUID', async () => {
      const session = await registerAndLogin('detail-missing');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${randomUUID()}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        code: 'PET_NOT_FOUND',
        error: 'Not Found',
        message: 'No se encontró la mascota solicitada.',
      });
    });

    it('returns INVALID_IDENTIFIER for a malformed UUID', async () => {
      const session = await registerAndLogin('detail-invalid-id');

      const response = await request(app.getHttpServer())
        .get('/api/v1/pets/not-a-uuid')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'INVALID_IDENTIFIER',
      });
    });
  });

  describe('PATCH /pets/:petId', () => {
    it('lets OWNER replace values, clear nullable fields, and preserve omitted fields', async () => {
      const owner = await registerAndLogin('patch-owner');
      const pet = await createPet(owner, 'patch-owner');
      const petId = pet.id as string;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          name: createPetName('renamed'),
          breed: null,
          birthDate: null,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        name: expect.stringContaining(`${petNamePrefix}-renamed`),
        species: pet.species,
        breed: null,
        birthDate: null,
        careMode: pet.careMode,
        rescueOrganizationName: pet.rescueOrganizationName,
        myRole: 'OWNER',
      });
    });

    it('lets CAREGIVER update Pet data and preserves its current role', async () => {
      const owner = await registerAndLogin('patch-care-owner');
      const caregiver = await registerAndLogin('patch-caregiver');
      const pet = await createPet(owner, 'patch-caregiver');
      const petId = pet.id as string;
      await addAccess(petId, caregiver, PetAccessRole.CAREGIVER);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${caregiver.accessToken}`)
        .send({ species: 'CAT', careMode: 'FOSTER' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: petId,
        species: 'CAT',
        careMode: 'FOSTER',
        myRole: 'CAREGIVER',
      });
    });

    it('rejects VIEWER without modifying the Pet', async () => {
      const owner = await registerAndLogin('patch-view-owner');
      const viewer = await registerAndLogin('patch-viewer');
      const pet = await createPet(owner, 'patch-viewer');
      const petId = pet.id as string;
      await addAccess(petId, viewer, PetAccessRole.VIEWER);
      const before = await findStoredPet(petId);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .send({ name: createPetName('forbidden-viewer') })
        .expect(403);

      expect(response.body).toMatchObject({
        code: 'PET_ROLE_FORBIDDEN',
        message: 'Tu rol no permite realizar esta acción sobre la mascota.',
      });
      await expect(findStoredPet(petId)).resolves.toEqual(before);
    });

    it('rejects an outsider without modifying the Pet', async () => {
      const owner = await registerAndLogin('patch-private-owner');
      const outsider = await registerAndLogin('patch-outsider');
      const pet = await createPet(owner, 'patch-private');
      const petId = pet.id as string;
      const before = await findStoredPet(petId);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ name: createPetName('forbidden-outsider') })
        .expect(403);

      expect(response.body).toMatchObject({ code: 'PET_ACCESS_DENIED' });
      await expect(findStoredPet(petId)).resolves.toEqual(before);
    });

    it('returns PET_NOT_FOUND before role checks for a nonexistent Pet', async () => {
      const session = await registerAndLogin('patch-missing');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${randomUUID()}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ name: createPetName('missing') })
        .expect(404);

      expect(response.body).toMatchObject({ code: 'PET_NOT_FOUND' });
    });

    it('rejects a future birthDate without modifying the Pet', async () => {
      const owner = await registerAndLogin('patch-future-owner');
      const pet = await createPet(owner, 'patch-future');
      const petId = pet.id as string;
      const before = await findStoredPet(petId);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ birthDate: tomorrow })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'PET_INVALID_BIRTH_DATE' });
      await expect(findStoredPet(petId)).resolves.toEqual(before);
    });

    it.each([
      { body: { name: null }, label: 'a null non-nullable field' },
      { body: { birthDate: '2024-02-31' }, label: 'an invalid date' },
      { body: { unexpected: true }, label: 'an unknown property' },
    ])('rejects $label with VALIDATION_ERROR', async ({ body }) => {
      const owner = await registerAndLogin('patch-invalid');
      const pet = await createPet(owner, 'patch-invalid');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${pet.id as string}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('returns INVALID_IDENTIFIER for a malformed UUID', async () => {
      const owner = await registerAndLogin('patch-invalid-id');

      const response = await request(app.getHttpServer())
        .patch('/api/v1/pets/not-a-uuid')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: createPetName('invalid-id') })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_IDENTIFIER' });
    });
  });

  describe('DELETE /pets/:petId', () => {
    it('lets OWNER delete with 204 and cascades PetAccess and Vaccination', async () => {
      const owner = await registerAndLogin('delete-owner');
      const viewer = await registerAndLogin('delete-related-viewer');
      const pet = await createPet(owner, 'delete-cascade');
      const petId = pet.id as string;
      await addAccess(petId, viewer, PetAccessRole.VIEWER);
      const vaccination = await prisma.vaccination.create({
        data: {
          petId,
          vaccineName: 'Antirrábica',
          appliedAt: new Date('2024-01-10T00:00:00.000Z'),
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);

      expect(response.text).toBe('');
      await expect(
        prisma.pet.findUnique({ where: { id: petId } }),
      ).resolves.toBeNull();
      await expect(
        prisma.petAccess.count({ where: { petId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.vaccination.findUnique({ where: { id: vaccination.id } }),
      ).resolves.toBeNull();
    });

    it.each([PetAccessRole.CAREGIVER, PetAccessRole.VIEWER])(
      'rejects %s and leaves all rows unchanged',
      async (role) => {
        const owner = await registerAndLogin(`delete-${role}-owner`);
        const actor = await registerAndLogin(`delete-${role}`);
        const pet = await createPet(owner, `delete-${role}`);
        const petId = pet.id as string;
        await addAccess(petId, actor, role);
        const accessCountBefore = await prisma.petAccess.count({
          where: { petId },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/pets/${petId}`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(403);

        expect(response.body).toMatchObject({ code: 'PET_ROLE_FORBIDDEN' });
        await expect(findStoredPet(petId)).resolves.toBeDefined();
        await expect(
          prisma.petAccess.count({ where: { petId } }),
        ).resolves.toBe(accessCountBefore);
      },
    );

    it('rejects an outsider and leaves the Pet unchanged', async () => {
      const owner = await registerAndLogin('delete-private-owner');
      const outsider = await registerAndLogin('delete-outsider');
      const pet = await createPet(owner, 'delete-private');
      const petId = pet.id as string;

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(403);

      expect(response.body).toMatchObject({ code: 'PET_ACCESS_DENIED' });
      await expect(findStoredPet(petId)).resolves.toBeDefined();
    });

    it('returns PET_NOT_FOUND for a nonexistent Pet', async () => {
      const owner = await registerAndLogin('delete-missing');

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);

      expect(response.body).toMatchObject({ code: 'PET_NOT_FOUND' });
    });

    it('returns INVALID_IDENTIFIER for a malformed UUID', async () => {
      const owner = await registerAndLogin('delete-invalid-id');

      const response = await request(app.getHttpServer())
        .delete('/api/v1/pets/not-a-uuid')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_IDENTIFIER' });
    });
  });
});
