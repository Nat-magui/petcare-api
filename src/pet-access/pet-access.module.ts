import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { PetAccessController } from './pet-access.controller.js';
import { PetAccessService } from './pet-access.service.js';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [PetAccessController],
  providers: [PetAccessService],
})
export class PetAccessModule {}
