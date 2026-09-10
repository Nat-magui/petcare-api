import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AppParseUUIDPipe } from '../common/pipes/app-parse-uuid.pipe.js';
import { CreateVaccinationDto } from './dto/create-vaccination.dto.js';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto.js';
import { VaccinationsService } from './vaccinations.service.js';
import type { VaccinationResponse } from './vaccinations.types.js';

@Controller('pets/:petId/vaccinations')
export class VaccinationsController {
  constructor(private readonly vaccinationsService: VaccinationsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Body() createVaccinationDto: CreateVaccinationDto,
  ): Promise<VaccinationResponse> {
    return this.vaccinationsService.create(
      request.user.userId,
      petId,
      createVaccinationDto,
    );
  }

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<VaccinationResponse[]> {
    return this.vaccinationsService.findAll(request.user.userId, petId);
  }

  @Get(':vaccinationId')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Param('vaccinationId', AppParseUUIDPipe) vaccinationId: string,
  ): Promise<VaccinationResponse> {
    return this.vaccinationsService.findOne(
      request.user.userId,
      petId,
      vaccinationId,
    );
  }

  @Patch(':vaccinationId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Param('vaccinationId', AppParseUUIDPipe) vaccinationId: string,
    @Body() updateVaccinationDto: UpdateVaccinationDto,
  ): Promise<VaccinationResponse> {
    return this.vaccinationsService.update(
      request.user.userId,
      petId,
      vaccinationId,
      updateVaccinationDto,
    );
  }

  @Delete(':vaccinationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Param('vaccinationId', AppParseUUIDPipe) vaccinationId: string,
  ): Promise<void> {
    return this.vaccinationsService.delete(
      request.user.userId,
      petId,
      vaccinationId,
    );
  }
}
