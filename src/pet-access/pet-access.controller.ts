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
import { PetAccessResponseDto } from '../common/swagger/api-response.dto.js';
import { SWAGGER_BEARER_AUTH } from '../common/swagger/swagger.config.js';
import { CreatePetAccessDto } from './dto/create-pet-access.dto.js';
import { UpdatePetAccessDto } from './dto/update-pet-access.dto.js';
import { PetAccessService } from './pet-access.service.js';
import type { PetAccessResponse } from './pet-access.types.js';

@ApiTags('pet-access')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller('pets/:petId/access')
export class PetAccessController {
  constructor(private readonly petAccessService: PetAccessService) {}

  @Get()
  @ApiOperation({ summary: 'Listar accesos de una mascota' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiOkResponse({ type: [PetAccessResponseDto] })
  @ApiPetCareErrors({
    400: [ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND],
  })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<PetAccessResponse[]> {
    return this.petAccessService.findAll(request.user.userId, petId);
  }

  @Post()
  @ApiOperation({ summary: 'Agregar acceso a una mascota' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiCreatedResponse({ type: PetAccessResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.VALIDATION_ERROR, ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND, ERROR_CODE.USER_NOT_FOUND],
    409: [ERROR_CODE.PET_ACCESS_EXISTS],
  })
  create(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Body() createPetAccessDto: CreatePetAccessDto,
  ): Promise<PetAccessResponse> {
    return this.petAccessService.create(
      request.user.userId,
      petId,
      createPetAccessDto,
    );
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Cambiar rol de acceso' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ type: PetAccessResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.VALIDATION_ERROR, ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND, ERROR_CODE.PET_ACCESS_NOT_FOUND],
    409: [ERROR_CODE.PET_LAST_OWNER],
  })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Param('userId', AppParseUUIDPipe) userId: string,
    @Body() updatePetAccessDto: UpdatePetAccessDto,
  ): Promise<PetAccessResponse> {
    return this.petAccessService.update(
      request.user.userId,
      petId,
      userId,
      updatePetAccessDto,
    );
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar acceso de una mascota' })
  @ApiParam({ name: 'petId', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Acceso eliminado.' })
  @ApiPetCareErrors({
    400: [ERROR_CODE.INVALID_IDENTIFIER],
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    403: [ERROR_CODE.PET_ACCESS_DENIED, ERROR_CODE.PET_ROLE_FORBIDDEN],
    404: [ERROR_CODE.PET_NOT_FOUND, ERROR_CODE.PET_ACCESS_NOT_FOUND],
    409: [ERROR_CODE.PET_LAST_OWNER],
  })
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Param('userId', AppParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.petAccessService.delete(request.user.userId, petId, userId);
  }
}
