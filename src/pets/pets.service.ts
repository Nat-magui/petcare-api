import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import {
  PetAccessRole,
  Prisma,
  type Pet,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePetDto } from './dto/create-pet.dto.js';
import type { PetResponse } from './pets.types.js';

const petSelect = {
  id: true,
  name: true,
  species: true,
  breed: true,
  birthDate: true,
  careMode: true,
  rescueOrganizationName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PetSelect;

type StoredPet = Pick<
  Pet,
  | 'id'
  | 'name'
  | 'species'
  | 'breed'
  | 'birthDate'
  | 'careMode'
  | 'rescueOrganizationName'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class PetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createPetDto: CreatePetDto): Promise<PetResponse> {
    const birthDate = this.parseBirthDate(createPetDto.birthDate);

    if (birthDate && this.isFutureBusinessDate(birthDate)) {
      throw new AppException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ERROR_CODE.PET_INVALID_BIRTH_DATE,
        message: ERROR_MESSAGE.PET_INVALID_BIRTH_DATE,
      });
    }

    const pet = await this.prisma.pet.create({
      data: {
        name: createPetDto.name,
        species: createPetDto.species,
        breed: createPetDto.breed ?? null,
        birthDate,
        careMode: createPetDto.careMode,
        rescueOrganizationName:
          createPetDto.rescueOrganizationName ?? null,
        accesses: {
          create: {
            userId,
            role: PetAccessRole.OWNER,
          },
        },
      },
      select: petSelect,
    });

    return this.toPetResponse(pet);
  }

  private parseBirthDate(value?: string | null): Date | null {
    return value == null ? null : new Date(`${value}T00:00:00.000Z`);
  }

  private isFutureBusinessDate(birthDate: Date): boolean {
    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );

    return birthDate.getTime() > todayUtc;
  }

  private toPetResponse(pet: StoredPet): PetResponse {
    return {
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      birthDate: pet.birthDate?.toISOString().slice(0, 10) ?? null,
      careMode: pet.careMode,
      rescueOrganizationName: pet.rescueOrganizationName,
      myRole: PetAccessRole.OWNER,
      createdAt: pet.createdAt,
      updatedAt: pet.updatedAt,
    };
  }
}
