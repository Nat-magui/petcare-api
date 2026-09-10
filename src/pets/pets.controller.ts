import { Body, Controller, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { CreatePetDto } from './dto/create-pet.dto.js';
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
}
