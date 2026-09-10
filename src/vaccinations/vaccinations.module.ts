import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { VaccinationsController } from './vaccinations.controller.js';
import { VaccinationsService } from './vaccinations.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [VaccinationsController],
  providers: [VaccinationsService],
})
export class VaccinationsModule {}
