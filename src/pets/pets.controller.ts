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
import { PetResponseDto } from '../common/swagger/api-response.dto.js';
import { SWAGGER_BEARER_AUTH } from '../common/swagger/swagger.config.js';
import { CreatePetDto } from './dto/create-pet.dto.js';
import { UpdatePetDto } from './dto/update-pet.dto.js';
import { PetsService } from './pets.service.js';
import type { PetResponse } from './pets.types.js';

@ApiTags('pets')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear mascota' })
  @ApiCreatedResponse({ type: PetResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.VALIDATION_ERROR, ERROR_CODE.PET_INVALID_BIRTH_DATE],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    500: [ERROR_CODE.INTERNAL_ERROR],
  })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createPetDto: CreatePetDto,
  ): Promise<PetResponse> {
    return this.petsService.create(request.user.userId, createPetDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar mascotas accesibles' })
  @ApiOkResponse({ type: [PetResponseDto] })
  @ApiPetCareErrors({
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    500: [ERROR_CODE.INTERNAL_ERROR],
  })
  findAll(@Req() request: AuthenticatedRequest): Promise<PetResponse[]> {
    return this.petsService.findAll(request.user.userId);
  }

  @Get(':petId')
  @ApiOperation({ summary: 'Obtener mascota' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiOkResponse({ type: PetResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED],
    404: [ERROR_CODE.PET_NOT_FOUND],
  })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<PetResponse> {
    return this.petsService.findOne(request.user.userId, petId);
  }

  @Patch(':petId')
  @ApiOperation({ summary: 'Actualizar mascota' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiOkResponse({ type: PetResponseDto })
  @ApiPetCareErrors({
    400: [
      ERROR_CODE.VALIDATION_ERROR,
      ERROR_CODE.INVALID_IDENTIFIER,
      ERROR_CODE.PET_INVALID_BIRTH_DATE,
    ],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND],
  })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Body() updatePetDto: UpdatePetDto,
  ): Promise<PetResponse> {
    return this.petsService.update(request.user.userId, petId, updatePetDto);
  }

  @Delete(':petId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar mascota' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Mascota eliminada.' })
  @ApiPetCareErrors({
    400: [ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND],
  })
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<void> {
    return this.petsService.delete(request.user.userId, petId);
  }
}
