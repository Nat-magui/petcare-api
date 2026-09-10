import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateVaccinationDto {
  @ApiProperty({ minLength: 2, maxLength: 120, example: 'Rabies' })
  @IsString({ message: 'El nombre de la vacuna es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre de la vacuna es obligatorio.' })
  @Length(2, 120, {
    message: 'El nombre de la vacuna debe tener entre 2 y 120 caracteres.',
  })
  vaccineName: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-08-15' })
  @Matches(BUSINESS_DATE_PATTERN, {
    message: 'La fecha de aplicación debe usar el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    {
      message: 'La fecha de aplicación debe usar el formato YYYY-MM-DD.',
    },
  )
  appliedAt: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-08-15',
  })
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, {
    message: 'La próxima fecha debe usar el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    {
      message: 'La próxima fecha debe usar el formato YYYY-MM-DD.',
    },
  )
  nextDueAt?: string | null;

  @ApiPropertyOptional({
    maxLength: 120,
    nullable: true,
    example: 'Dra. Pérez',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'El nombre del veterinario no puede superar los 120 caracteres.',
  })
  veterinarianName?: string | null;

  @ApiPropertyOptional({
    maxLength: 120,
    nullable: true,
    example: 'Clínica Central',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'El nombre de la clínica no puede superar los 120 caracteres.',
  })
  clinicName?: string | null;

  @ApiPropertyOptional({
    maxLength: 1000,
    nullable: true,
    example: 'Primera dosis anual.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Las notas no pueden superar los 1000 caracteres.',
  })
  notes?: string | null;
}
