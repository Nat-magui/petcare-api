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
import { CreatePetAccessDto } from './dto/create-pet-access.dto.js';
import { UpdatePetAccessDto } from './dto/update-pet-access.dto.js';
import { PetAccessService } from './pet-access.service.js';
import type { PetAccessResponse } from './pet-access.types.js';

@Controller('pets/:petId/access')
export class PetAccessController {
  constructor(private readonly petAccessService: PetAccessService) {}

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<PetAccessResponse[]> {
    return this.petAccessService.findAll(request.user.userId, petId);
  }

  @Post()
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
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Param('userId', AppParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.petAccessService.delete(
      request.user.userId,
      petId,
      userId,
    );
  }
}
