import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import {
  PetAccessRole,
  Prisma,
  type Vaccination,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateVaccinationDto } from './dto/create-vaccination.dto.js';
import type { VaccinationResponse } from './vaccinations.types.js';

const vaccinationSelect = {
  id: true,
  petId: true,
  vaccineName: true,
  appliedAt: true,
  nextDueAt: true,
  veterinarianName: true,
  clinicName: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VaccinationSelect;

type StoredVaccination = Pick<
  Vaccination,
  | 'id'
  | 'petId'
  | 'vaccineName'
  | 'appliedAt'
  | 'nextDueAt'
  | 'veterinarianName'
  | 'clinicName'
  | 'notes'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class VaccinationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    requesterId: string,
    petId: string,
    createVaccinationDto: CreateVaccinationDto,
  ): Promise<VaccinationResponse> {
    await this.assertCanCreate(requesterId, petId);

    this.validateBusinessDates(
      createVaccinationDto.appliedAt,
      createVaccinationDto.nextDueAt,
    );

    const vaccination = await this.prisma.vaccination.create({
      data: {
        petId,
        vaccineName: createVaccinationDto.vaccineName,
        appliedAt: this.toDatabaseDate(createVaccinationDto.appliedAt),
        nextDueAt:
          createVaccinationDto.nextDueAt == null
            ? null
            : this.toDatabaseDate(createVaccinationDto.nextDueAt),
        veterinarianName: createVaccinationDto.veterinarianName ?? null,
        clinicName: createVaccinationDto.clinicName ?? null,
        notes: createVaccinationDto.notes ?? null,
      },
      select: vaccinationSelect,
    });

    return this.toVaccinationResponse(vaccination);
  }

  private async assertCanCreate(
    requesterId: string,
    petId: string,
  ): Promise<void> {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      select: { id: true },
    });

    if (!pet) {
      throw new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: ERROR_CODE.PET_NOT_FOUND,
        message: ERROR_MESSAGE.PET_NOT_FOUND,
      });
    }

    const requesterAccess = await this.prisma.petAccess.findUnique({
      where: {
        userId_petId: {
          userId: requesterId,
          petId,
        },
      },
      select: { role: true },
    });

    if (!requesterAccess) {
      throw new AppException({
        statusCode: HttpStatus.FORBIDDEN,
        code: ERROR_CODE.PET_ACCESS_DENIED,
        message: ERROR_MESSAGE.PET_ACCESS_DENIED,
      });
    }

    if (requesterAccess.role === PetAccessRole.VIEWER) {
      throw new AppException({
        statusCode: HttpStatus.FORBIDDEN,
        code: ERROR_CODE.PET_ROLE_FORBIDDEN,
        message: ERROR_MESSAGE.PET_ROLE_FORBIDDEN,
      });
    }
  }

  private validateBusinessDates(
    appliedAt: string,
    nextDueAt?: string | null,
  ): void {
    const today = new Date().toISOString().slice(0, 10);

    if (appliedAt > today) {
      throw this.invalidDatesException({
        field: 'appliedAt',
        message: 'La fecha de aplicación no puede ser futura.',
      });
    }

    if (nextDueAt != null && nextDueAt < appliedAt) {
      throw this.invalidDatesException({
        field: 'nextDueAt',
        message:
          'La próxima fecha no puede ser anterior a la fecha de aplicación.',
      });
    }
  }

  private toDatabaseDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private invalidDatesException(details: {
    field: string;
    message: string;
  }): AppException {
    return new AppException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODE.VACCINATION_INVALID_DATES,
      message: ERROR_MESSAGE.VACCINATION_INVALID_DATES,
      details,
    });
  }

  private toVaccinationResponse(
    vaccination: StoredVaccination,
  ): VaccinationResponse {
    return {
      id: vaccination.id,
      petId: vaccination.petId,
      vaccineName: vaccination.vaccineName,
      appliedAt: vaccination.appliedAt.toISOString().slice(0, 10),
      nextDueAt:
        vaccination.nextDueAt?.toISOString().slice(0, 10) ?? null,
      veterinarianName: vaccination.veterinarianName,
      clinicName: vaccination.clinicName,
      notes: vaccination.notes,
      createdAt: vaccination.createdAt,
      updatedAt: vaccination.updatedAt,
    };
  }
}
