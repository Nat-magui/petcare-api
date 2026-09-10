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
import { CreatePetDto } from './dto/create-pet.dto.js';
import { UpdatePetDto } from './dto/update-pet.dto.js';
import { PetsService } from './pets.service.js';
import type { PetResponse } from './pets.types.js';

@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createPetDto: CreatePetDto,
  ): Promise<PetResponse> {
    return this.petsService.create(request.user.userId, createPetDto);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest): Promise<PetResponse[]> {
    return this.petsService.findAll(request.user.userId);
  }

  @Get(':petId')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<PetResponse> {
    return this.petsService.findOne(request.user.userId, petId);
  }

  @Patch(':petId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
    @Body() updatePetDto: UpdatePetDto,
  ): Promise<PetResponse> {
    return this.petsService.update(
      request.user.userId,
      petId,
      updatePetDto,
    );
  }

  @Delete(':petId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('petId', AppParseUUIDPipe) petId: string,
  ): Promise<void> {
    return this.petsService.delete(request.user.userId, petId);
  }
}
