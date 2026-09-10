import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import {
  CareMode,
  PetAccessRole,
  Species,
} from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PetsService } from './pets.service.js';

describe('PetsService', () => {
  const userId = '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884';
  const createdAt = new Date('2026-09-10T12:00:00.000Z');
  const storedPet = {
    id: 'c3b80c82-8687-45a0-a84e-07ba56c01f23',
    name: 'Luna',
    species: Species.CAT,
    breed: null,
    birthDate: new Date('2024-03-10T00:00:00.000Z'),
    careMode: CareMode.FOSTER,
    rescueOrganizationName: 'Patitas Felices',
    createdAt,
    updatedAt: createdAt,
  };

  let prisma: {
    pet: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    petAccess: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: PetsService;

  beforeEach(() => {
    prisma = {
      pet: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      petAccess: {
        findMany: vi.fn(),
      },
    };
    service = new PetsService(prisma as unknown as PrismaService);
  });

  it('creates the pet and its owner access in one nested write', async () => {
    prisma.pet.create.mockResolvedValue(storedPet);

    const result = await service.create(userId, {
      name: 'Luna',
      species: Species.CAT,
      birthDate: '2024-03-10',
      careMode: CareMode.FOSTER,
      rescueOrganizationName: 'Patitas Felices',
    });

    expect(prisma.pet.create).toHaveBeenCalledWith({
      data: {
        name: 'Luna',
        species: Species.CAT,
        breed: null,
        birthDate: new Date('2024-03-10T00:00:00.000Z'),
        careMode: CareMode.FOSTER,
        rescueOrganizationName: 'Patitas Felices',
        accesses: {
          create: {
            userId,
            role: PetAccessRole.OWNER,
          },
        },
      },
      select: {
        id: true,
        name: true,
        species: true,
        breed: true,
        birthDate: true,
        careMode: true,
        rescueOrganizationName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(result).toEqual({
      ...storedPet,
      birthDate: '2024-03-10',
      myRole: PetAccessRole.OWNER,
    });
  });

  it('rejects a future birth date before persistence', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await expect(
      service.create(userId, {
        name: 'Future Pet',
        species: Species.DOG,
        birthDate: tomorrow,
        careMode: CareMode.FAMILY,
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ERROR_CODE.PET_INVALID_BIRTH_DATE,
        error: 'Bad Request',
        message: ERROR_MESSAGE.PET_INVALID_BIRTH_DATE,
      },
    });
    expect(prisma.pet.create).not.toHaveBeenCalled();
  });

  it('propagates a failed atomic nested write', async () => {
    const persistenceError = new Error('PetAccess creation failed');
    prisma.pet.create.mockRejectedValue(persistenceError);

    await expect(
      service.create(userId, {
        name: 'Luna',
        species: Species.CAT,
        careMode: CareMode.FAMILY,
      }),
    ).rejects.toBe(persistenceError);
    expect(prisma.pet.create).toHaveBeenCalledOnce();
  });

  it('lists only access rows for the current user and maps their roles', async () => {
    prisma.petAccess.findMany.mockResolvedValue([
      { role: PetAccessRole.VIEWER, pet: storedPet },
    ]);

    await expect(service.findAll(userId)).resolves.toEqual([
      {
        ...storedPet,
        birthDate: '2024-03-10',
        myRole: PetAccessRole.VIEWER,
      },
    ]);
    expect(prisma.petAccess.findMany).toHaveBeenCalledWith({
      where: { userId },
      select: {
        role: true,
        pet: {
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            birthDate: true,
            careMode: true,
            rescueOrganizationName: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  });

  it('resolves Pet existence before access denial', async () => {
    prisma.pet.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...storedPet,
      accesses: [],
    });

    await expect(service.findOne(userId, storedPet.id)).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_NOT_FOUND },
    });
    await expect(service.findOne(userId, storedPet.id)).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ACCESS_DENIED },
    });
  });

  it('applies only provided PATCH values for CAREGIVER', async () => {
    prisma.pet.findUnique.mockResolvedValue({
      ...storedPet,
      accesses: [{ role: PetAccessRole.CAREGIVER }],
    });
    prisma.pet.update.mockResolvedValue({
      ...storedPet,
      name: 'Luna actualizada',
      breed: null,
    });

    const result = await service.update(userId, storedPet.id, {
      name: 'Luna actualizada',
      breed: null,
    });

    expect(prisma.pet.update).toHaveBeenCalledWith({
      where: { id: storedPet.id },
      data: { name: 'Luna actualizada', breed: null },
      select: expect.any(Object),
    });
    expect(result).toMatchObject({
      name: 'Luna actualizada',
      breed: null,
      species: storedPet.species,
      myRole: PetAccessRole.CAREGIVER,
    });
  });

  it('rejects VIEWER before issuing an update', async () => {
    prisma.pet.findUnique.mockResolvedValue({
      ...storedPet,
      accesses: [{ role: PetAccessRole.VIEWER }],
    });

    await expect(
      service.update(userId, storedPet.id, { name: 'Forbidden' }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ROLE_FORBIDDEN },
    });
    expect(prisma.pet.update).not.toHaveBeenCalled();
  });

  it('allows OWNER to delete the Pet resource', async () => {
    prisma.pet.findUnique.mockResolvedValue({
      ...storedPet,
      accesses: [{ role: PetAccessRole.OWNER }],
    });
    prisma.pet.delete.mockResolvedValue({ id: storedPet.id });

    await expect(service.delete(userId, storedPet.id)).resolves.toBeUndefined();
    expect(prisma.pet.delete).toHaveBeenCalledWith({
      where: { id: storedPet.id },
      select: { id: true },
    });
  });
});
