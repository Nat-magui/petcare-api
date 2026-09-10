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
import type { UpdatePetDto } from './dto/update-pet.dto.js';
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

interface PetAccessContext {
  pet: StoredPet;
  role: PetAccessRole;
}

@Injectable()
export class PetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createPetDto: CreatePetDto): Promise<PetResponse> {
    const birthDate = this.parseBirthDate(createPetDto.birthDate);

    if (birthDate && this.isFutureBusinessDate(birthDate)) {
      throw this.invalidBirthDateException();
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

    return this.toPetResponse(pet, PetAccessRole.OWNER);
  }

  async findAll(userId: string): Promise<PetResponse[]> {
    const accesses = await this.prisma.petAccess.findMany({
      where: { userId },
      select: {
        role: true,
        pet: { select: petSelect },
      },
    });

    return accesses.map(({ pet, role }) => this.toPetResponse(pet, role));
  }

  async findOne(userId: string, petId: string): Promise<PetResponse> {
    const { pet, role } = await this.getPetAccessContext(userId, petId);

    return this.toPetResponse(pet, role);
  }

  async update(
    userId: string,
    petId: string,
    updatePetDto: UpdatePetDto,
  ): Promise<PetResponse> {
    const { pet, role } = await this.getPetAccessContext(userId, petId);

    if (role === PetAccessRole.VIEWER) {
      throw this.roleForbiddenException();
    }

    const finalBirthDate =
      updatePetDto.birthDate === undefined
        ? pet.birthDate
        : this.parseBirthDate(updatePetDto.birthDate);

    if (finalBirthDate && this.isFutureBusinessDate(finalBirthDate)) {
      throw this.invalidBirthDateException();
    }

    const data: Prisma.PetUpdateInput = {};

    if (updatePetDto.name !== undefined) data.name = updatePetDto.name;
    if (updatePetDto.species !== undefined) data.species = updatePetDto.species;
    if (updatePetDto.breed !== undefined) data.breed = updatePetDto.breed;
    if (updatePetDto.birthDate !== undefined) data.birthDate = finalBirthDate;
    if (updatePetDto.careMode !== undefined) {
      data.careMode = updatePetDto.careMode;
    }
    if (updatePetDto.rescueOrganizationName !== undefined) {
      data.rescueOrganizationName = updatePetDto.rescueOrganizationName;
    }

    if (Object.keys(data).length === 0) {
      return this.toPetResponse(pet, role);
    }

    const updatedPet = await this.prisma.pet.update({
      where: { id: petId },
      data,
      select: petSelect,
    });

    return this.toPetResponse(updatedPet, role);
  }

  async delete(userId: string, petId: string): Promise<void> {
    const { role } = await this.getPetAccessContext(userId, petId);

    if (role !== PetAccessRole.OWNER) {
      throw this.roleForbiddenException();
    }

    await this.prisma.pet.delete({
      where: { id: petId },
      select: { id: true },
    });
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

  private async getPetAccessContext(
    userId: string,
    petId: string,
  ): Promise<PetAccessContext> {
    const result = await this.prisma.pet.findUnique({
      where: { id: petId },
      select: {
        ...petSelect,
        accesses: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!result) {
      throw new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: ERROR_CODE.PET_NOT_FOUND,
        message: ERROR_MESSAGE.PET_NOT_FOUND,
      });
    }

    const access = result.accesses[0];

    if (!access) {
      throw new AppException({
        statusCode: HttpStatus.FORBIDDEN,
        code: ERROR_CODE.PET_ACCESS_DENIED,
        message: ERROR_MESSAGE.PET_ACCESS_DENIED,
      });
    }

    const { accesses: _accesses, ...pet } = result;

    return { pet, role: access.role };
  }

  private invalidBirthDateException(): AppException {
    return new AppException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODE.PET_INVALID_BIRTH_DATE,
      message: ERROR_MESSAGE.PET_INVALID_BIRTH_DATE,
    });
  }

  private roleForbiddenException(): AppException {
    return new AppException({
      statusCode: HttpStatus.FORBIDDEN,
      code: ERROR_CODE.PET_ROLE_FORBIDDEN,
      message: ERROR_MESSAGE.PET_ROLE_FORBIDDEN,
    });
  }

  private toPetResponse(
    pet: StoredPet,
    role: PetAccessRole,
  ): PetResponse {
    return {
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      birthDate: pet.birthDate?.toISOString().slice(0, 10) ?? null,
      careMode: pet.careMode,
      rescueOrganizationName: pet.rescueOrganizationName,
      myRole: role,
      createdAt: pet.createdAt,
      updatedAt: pet.updatedAt,
    };
  }
}
