import { IsEmail, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ minLength: 2, maxLength: 80, example: 'Maga' })
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({ format: 'email', example: 'maga@example.com' })
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    writeOnly: true,
    example: 'Petcare123!',
  })
  @IsString()
  @Length(8, 72)
  password: string;
}
