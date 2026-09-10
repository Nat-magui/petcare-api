import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const UUID_EXAMPLE = '8f65ef9e-2b41-4f47-a328-0e3789f9c753';
const DATE_TIME_EXAMPLE = '2026-09-10T14:30:00.000Z';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: 'ok';
}

export class PublicUserResponseDto {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ example: 'Maga' })
  name: string;

  @ApiProperty({ format: 'email', example: 'maga@example.com' })
  email: string;

  @ApiProperty({ format: 'date-time', example: DATE_TIME_EXAMPLE })
  createdAt: Date;
}

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT de acceso para enviar como Bearer token.',
    example: 'eyJhbGciOiJIUzI1NiJ9.access-token-example',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'JWT de refresh que el cliente debe conservar de forma segura.',
    example: 'eyJhbGciOiJIUzI1NiJ9.refresh-token-example',
  })
  refreshToken: string;

  @ApiProperty({ type: () => PublicUserResponseDto })
  user: PublicUserResponseDto;
}

export class RefreshResponseDto {
  @ApiProperty({
    description: 'Nuevo JWT de acceso. El refresh token no rota en V1.',
    example: 'eyJhbGciOiJIUzI1NiJ9.access-token-example',
  })
  accessToken: string;
}

export class PetResponseDto {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ example: 'Luna' })
  name: string;

  @ApiProperty({ enum: ['DOG', 'CAT', 'OTHER'], example: 'DOG' })
  species: 'DOG' | 'CAT' | 'OTHER';

  @ApiProperty({ nullable: true, example: 'Mestiza' })
  breed: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2021-04-12',
  })
  birthDate: string | null;

  @ApiProperty({ enum: ['FAMILY', 'FOSTER'], example: 'FAMILY' })
  careMode: 'FAMILY' | 'FOSTER';

  @ApiProperty({ nullable: true, example: null })
  rescueOrganizationName: string | null;

  @ApiProperty({ enum: ['OWNER', 'CAREGIVER', 'VIEWER'], example: 'OWNER' })
  myRole: 'OWNER' | 'CAREGIVER' | 'VIEWER';

  @ApiProperty({ format: 'date-time', example: DATE_TIME_EXAMPLE })
  createdAt: Date;

  @ApiProperty({ format: 'date-time', example: DATE_TIME_EXAMPLE })
  updatedAt: Date;
}

export class PetAccessResponseDto {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  userId: string;

  @ApiProperty({ example: 'Maga' })
  name: string;

  @ApiProperty({ format: 'email', example: 'maga@example.com' })
  email: string;

  @ApiProperty({ enum: ['OWNER', 'CAREGIVER', 'VIEWER'], example: 'CAREGIVER' })
  role: 'OWNER' | 'CAREGIVER' | 'VIEWER';

  @ApiProperty({ format: 'date-time', example: DATE_TIME_EXAMPLE })
  createdAt: Date;
}

export class VaccinationResponseDto {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  petId: string;

  @ApiProperty({ example: 'Rabies' })
  vaccineName: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-08-15' })
  appliedAt: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-08-15',
  })
  nextDueAt: string | null;

  @ApiProperty({ nullable: true, example: 'Dra. Pérez' })
  veterinarianName: string | null;

  @ApiProperty({ nullable: true, example: 'Clínica Central' })
  clinicName: string | null;

  @ApiProperty({ nullable: true, example: 'Primera dosis anual.' })
  notes: string | null;

  @ApiProperty({ format: 'date-time', example: DATE_TIME_EXAMPLE })
  createdAt: Date;

  @ApiProperty({ format: 'date-time', example: DATE_TIME_EXAMPLE })
  updatedAt: Date;
}

export class ApiErrorDetailDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'El email debe tener un formato válido.' })
  message: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code: string;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'Los datos enviados no son válidos.' })
  message: string;

  @ApiPropertyOptional({
    description: 'Detalle opcional de campos inválidos.',
    type: () => ApiErrorDetailDto,
    isArray: true,
    nullable: true,
  })
  details?: ApiErrorDetailDto[] | null;
}
