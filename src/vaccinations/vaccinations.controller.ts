import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AppParseUUIDPipe } from '../common/pipes/app-parse-uuid.pipe.js';
import { CreateVaccinationDto } from './dto/create-vaccination.dto.js';
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
}
