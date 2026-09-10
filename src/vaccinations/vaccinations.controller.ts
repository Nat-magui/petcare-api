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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { AppParseUUIDPipe } from '../common/pipes/app-parse-uuid.pipe.js';
import { ApiPetCareErrors } from '../common/swagger/api-errors.decorator.js';
import { VaccinationResponseDto } from '../common/swagger/api-response.dto.js';
import { SWAGGER_BEARER_AUTH } from '../common/swagger/swagger.config.js';
import { CreateVaccinationDto } from './dto/create-vaccination.dto.js';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto.js';
import { VaccinationsService } from './vaccinations.service.js';
import type { VaccinationResponse } from './vaccinations.types.js';

@ApiTags('vaccinations')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller('pets/:petId/vaccinations')
export class VaccinationsController {
  constructor(private readonly vaccinationsService: VaccinationsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar vacunación' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiCreatedResponse({ type: VaccinationResponseDto })
  @ApiPetCareErrors({
    400: [
      ERROR_CODE.VALIDATION_ERROR,
      ERROR_CODE.INVALID_IDENTIFIER,
      ERROR_CODE.VACCINATION_INVALID_DATES,
    ],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND],
  })
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
  @ApiOperation({ summary: 'Listar vacunaciones' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiOkResponse({ type: [VaccinationResponseDto] })
  @ApiPetCareErrors({
    400: [ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED],
    404: [ERROR_CODE.PET_NOT_FOUND],
  })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<VaccinationResponse[]> {
    return this.vaccinationsService.findAll(request.user.userId, petId);
  }

  @Get(':vaccinationId')
  @ApiOperation({ summary: 'Obtener vacunación' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiParam({ name: 'vaccinationId', format: 'uuid' })
  @ApiOkResponse({ type: VaccinationResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED],
    404: [ERROR_CODE.PET_NOT_FOUND, ERROR_CODE.VACCINATION_NOT_FOUND],
  })
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
  @ApiOperation({ summary: 'Actualizar vacunación' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiParam({ name: 'vaccinationId', format: 'uuid' })
  @ApiOkResponse({ type: VaccinationResponseDto })
  @ApiPetCareErrors({
    400: [
      ERROR_CODE.VALIDATION_ERROR,
      ERROR_CODE.INVALID_IDENTIFIER,
      ERROR_CODE.VACCINATION_INVALID_DATES,
    ],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND, ERROR_CODE.VACCINATION_NOT_FOUND],
  })
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
  @ApiOperation({ summary: 'Eliminar vacunación' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiParam({ name: 'vaccinationId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Vacunación eliminada.' })
  @ApiPetCareErrors({
    400: [ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND, ERROR_CODE.VACCINATION_NOT_FOUND],
  })
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
