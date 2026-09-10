import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh JWT obtenido al iniciar sesión.',
    writeOnly: true,
    example: 'eyJhbGciOiJIUzI1NiJ9.refresh-token-example',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
