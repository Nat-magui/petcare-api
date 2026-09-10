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
import type { UpdateVaccinationDto } from './dto/update-vaccination.dto.js';
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
    await this.assertPetAccess(requesterId, petId, true);

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

  async findAll(
    requesterId: string,
    petId: string,
  ): Promise<VaccinationResponse[]> {
    await this.assertPetAccess(requesterId, petId, false);

    const vaccinations = await this.prisma.vaccination.findMany({
      where: { petId },
      select: vaccinationSelect,
    });

    return vaccinations.map((vaccination) =>
      this.toVaccinationResponse(vaccination),
    );
  }

  async findOne(
    requesterId: string,
    petId: string,
    vaccinationId: string,
  ): Promise<VaccinationResponse> {
    await this.assertPetAccess(requesterId, petId, false);
    const vaccination = await this.findScopedVaccination(
      petId,
      vaccinationId,
    );

    return this.toVaccinationResponse(vaccination);
  }

  async update(
    requesterId: string,
    petId: string,
    vaccinationId: string,
    updateVaccinationDto: UpdateVaccinationDto,
  ): Promise<VaccinationResponse> {
    await this.assertPetAccess(requesterId, petId, true);
    const vaccination = await this.findScopedVaccination(
      petId,
      vaccinationId,
    );

    const existingAppliedAt = this.toBusinessDate(vaccination.appliedAt);
    const existingNextDueAt = vaccination.nextDueAt
      ? this.toBusinessDate(vaccination.nextDueAt)
      : null;
    const finalAppliedAt = updateVaccinationDto.appliedAt ?? existingAppliedAt;
    const finalNextDueAt =
      updateVaccinationDto.nextDueAt === undefined
        ? existingNextDueAt
        : updateVaccinationDto.nextDueAt;

    this.validateBusinessDates(finalAppliedAt, finalNextDueAt);

    const data: Prisma.VaccinationUpdateInput = {};
    if (updateVaccinationDto.vaccineName !== undefined) {
      data.vaccineName = updateVaccinationDto.vaccineName;
    }
    if (updateVaccinationDto.appliedAt !== undefined) {
      data.appliedAt = this.toDatabaseDate(updateVaccinationDto.appliedAt);
    }
    if (updateVaccinationDto.nextDueAt !== undefined) {
      data.nextDueAt =
        updateVaccinationDto.nextDueAt === null
          ? null
          : this.toDatabaseDate(updateVaccinationDto.nextDueAt);
    }
    if (updateVaccinationDto.veterinarianName !== undefined) {
      data.veterinarianName = updateVaccinationDto.veterinarianName;
    }
    if (updateVaccinationDto.clinicName !== undefined) {
      data.clinicName = updateVaccinationDto.clinicName;
    }
    if (updateVaccinationDto.notes !== undefined) {
      data.notes = updateVaccinationDto.notes;
    }

    if (Object.keys(data).length === 0) {
      return this.toVaccinationResponse(vaccination);
    }

    const updatedVaccination = await this.prisma.vaccination.update({
      where: { id: vaccinationId },
      data,
      select: vaccinationSelect,
    });

    return this.toVaccinationResponse(updatedVaccination);
  }

  async delete(
    requesterId: string,
    petId: string,
    vaccinationId: string,
  ): Promise<void> {
    await this.assertPetAccess(requesterId, petId, true);
    await this.findScopedVaccination(petId, vaccinationId);
    await this.prisma.vaccination.delete({
      where: { id: vaccinationId },
      select: { id: true },
    });
  }

  private async assertPetAccess(
    requesterId: string,
    petId: string,
    writeRequired: boolean,
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

    if (writeRequired && requesterAccess.role === PetAccessRole.VIEWER) {
      throw new AppException({
        statusCode: HttpStatus.FORBIDDEN,
        code: ERROR_CODE.PET_ROLE_FORBIDDEN,
        message: ERROR_MESSAGE.PET_ROLE_FORBIDDEN,
      });
    }
  }

  private async findScopedVaccination(
    petId: string,
    vaccinationId: string,
  ): Promise<StoredVaccination> {
    const vaccination = await this.prisma.vaccination.findFirst({
      where: { id: vaccinationId, petId },
      select: vaccinationSelect,
    });

    if (!vaccination) {
      throw new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: ERROR_CODE.VACCINATION_NOT_FOUND,
        message: ERROR_MESSAGE.VACCINATION_NOT_FOUND,
      });
    }

    return vaccination;
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

  private toBusinessDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private invalidDatesException(details: {
    field: string;
    message: string;
  }): AppException {
    return new AppException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODE.VACCINATION_INVALID_DATES,
      message: ERROR_MESSAGE.VACCINATION_INVALID_DATES,
      details: [details],
    });
  }

  private toVaccinationResponse(
    vaccination: StoredVaccination,
  ): VaccinationResponse {
    return {
      id: vaccination.id,
      petId: vaccination.petId,
      vaccineName: vaccination.vaccineName,
      appliedAt: this.toBusinessDate(vaccination.appliedAt),
      nextDueAt: vaccination.nextDueAt
        ? this.toBusinessDate(vaccination.nextDueAt)
        : null,
      veterinarianName: vaccination.veterinarianName,
      clinicName: vaccination.clinicName,
      notes: vaccination.notes,
      createdAt: vaccination.createdAt,
      updatedAt: vaccination.updatedAt,
    };
  }
}
