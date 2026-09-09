import { IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(2, 80)
  name: string;

  @IsString()
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 72)
  password: string;
}
