import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'maga@example.com' })
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ writeOnly: true, example: 'Petcare123!' })
  @IsString()
  password: string;
}
